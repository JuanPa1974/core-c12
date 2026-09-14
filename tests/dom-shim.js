'use strict';

/*
 * Minimal DOM emulation used ONLY to load and exercise the real calc.js
 * (unmodified) inside Node's built-in `vm` module — zero npm dependencies.
 *
 * It parses the real index.html to discover every <button data-action=...>
 * and the three display elements calc.js reads by id, so the button set the
 * tests click against is the actual production markup, not a hand-copied
 * duplicate that could silently drift from it.
 *
 * It implements only the handful of DOM APIs calc.js actually calls:
 * document.getElementById / querySelector / querySelectorAll /
 * addEventListener, plus element.classList (add/remove/toggle/contains),
 * element.dataset and element.closest('[data-action]').
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');
const INDEX_HTML_PATH = path.join(ROOT, 'index.html');
const CORE_JS_PATH = path.join(ROOT, 'src', 'core', 'calculator.js');
const STATE_JS_PATH = path.join(ROOT, 'src', 'state', 'calculator-state.js');
const PRO_FEATURES_JS_PATH = path.join(ROOT, 'src', 'state', 'pro-features.js');
const STORAGE_JS_PATH = path.join(ROOT, 'src', 'storage', 'preferences.js');
const CONFIG_JS_PATH = path.join(ROOT, 'src', 'config.js');
const CALC_JS_PATH = path.join(ROOT, 'src', 'calc.js');

/**
 * Minimal in-memory localStorage, with test-only hooks to simulate a
 * browser that blocks or throws on storage access (private mode, quota,
 * disabled storage) — used to verify config.js never lets a storage
 * failure reach the calculation engine. Passing the SAME instance to two
 * createEngine() calls simulates a page refresh: fresh JS state, same
 * persisted storage — exactly like a real browser reload.
 */
function createFakeLocalStorage() {
  const store = new Map();
  let brokenRead = false;
  let brokenWrite = false;
  return {
    getItem(key) {
      if (brokenRead) throw new Error('SecurityError: localStorage blocked (simulated)');
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      if (brokenWrite) throw new Error('QuotaExceededError (simulated)');
      store.set(key, String(value));
    },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); },
    _setBrokenRead(v) { brokenRead = v; },
    _setBrokenWrite(v) { brokenWrite = v; },
    _raw(key) { return store.has(key) ? store.get(key) : null; },
  };
}

function toCamel(attrName) {
  return attrName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function extractButtons(html) {
  const buttons = [];
  const buttonRe = /<button\b([^>]*)>/gi;
  const attrRe = /([a-zA-Z0-9_-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = buttonRe.exec(html))) {
    const attrs = {};
    let am;
    attrRe.lastIndex = 0;
    while ((am = attrRe.exec(m[1]))) {
      attrs[am[1]] = am[2];
    }
    buttons.push(attrs);
  }
  return buttons;
}

function extractElementText(html, id) {
  const re = new RegExp('<[^>]*\\bid="' + id + '"[^>]*>([^<]*)<');
  const m = html.match(re);
  return m ? m[1] : '';
}

// Discovers every non-<button> element carrying an id="..." (divs, spans used
// as containers or text targets calc.js addresses directly via
// getElementById — e.g. the Fase 2B edit-mode labels/containers). Buttons
// are excluded here since extractButtons() already covers them, with click
// simulation dispatch that this generic pass doesn't need to duplicate.
function extractIdElements(html) {
  const results = [];
  const tagRe = /<([a-zA-Z0-9]+)\b([^>]*)\bid="([a-zA-Z0-9_-]+)"([^>]*)>/g;
  let m;
  while ((m = tagRe.exec(html))) {
    const tag = m[1].toLowerCase();
    if (tag === 'button') continue;
    const attrsRaw = m[2] + ' ' + m[4];
    const classMatch = attrsRaw.match(/\bclass="([^"]*)"/);
    results.push({
      tag,
      id: m[3],
      className: classMatch ? classMatch[1] : '',
      hidden: /(^|\s)hidden(\s|=|$)/.test(attrsRaw),
    });
  }
  return results;
}

class FakeClassList {
  constructor(el) {
    this._el = el;
    this._set = new Set((el.className || '').split(/\s+/).filter(Boolean));
  }
  add(c) { this._set.add(c); this._sync(); }
  remove(c) { this._set.delete(c); this._sync(); }
  toggle(c, force) {
    if (force === undefined) {
      this._set.has(c) ? this._set.delete(c) : this._set.add(c);
    } else if (force) {
      this._set.add(c);
    } else {
      this._set.delete(c);
    }
    this._sync();
  }
  contains(c) { return this._set.has(c); }
  _sync() { this._el.className = Array.from(this._set).join(' '); }
}

class FakeElement {
  constructor({ tag = 'div', className = '', dataset = {}, id = null, textContent = '' } = {}) {
    this.tagName = tag;
    this.className = className;
    this.dataset = dataset;
    this.id = id;
    this.textContent = textContent;
    this.parentElement = null;
    this._listeners = {};
    this._attrs = {};
    this.classList = new FakeClassList(this);
  }
  addEventListener(type, handler) { this._listeners[type] = handler; }
  setAttribute(name, value) { this._attrs[name] = String(value); }
  getAttribute(name) { return name in this._attrs ? this._attrs[name] : null; }
  closest(selector) {
    let el = this;
    while (el) {
      if (selector === '[data-action]' && el.dataset && el.dataset.action !== undefined) return el;
      el = el.parentElement;
    }
    return null;
  }
}

function matchesSelector(el, selector) {
  if (selector.startsWith('.')) {
    return el.classList.contains(selector.slice(1));
  }
  let m = selector.match(/^\[data-([a-zA-Z-]+)="([^"]*)"\]$/);
  if (m) return el.dataset[toCamel(m[1])] === m[2];
  m = selector.match(/^\[data-([a-zA-Z-]+)\]$/);
  if (m) return el.dataset[toCamel(m[1])] !== undefined;
  return false;
}

function buildFakeDocument(html) {
  const appEl = new FakeElement({ tag: 'div', className: 'app' });
  const allElements = [appEl];

  const buttons = extractButtons(html).map((attrs) => {
    const dataset = {};
    for (const key of Object.keys(attrs)) {
      if (key.startsWith('data-')) dataset[toCamel(key.slice(5))] = attrs[key];
    }
    const el = new FakeElement({ tag: 'button', className: attrs.class || '', dataset });
    el.parentElement = appEl;
    return el;
  });
  allElements.push(...buttons);

  const displayEls = {};
  const DISPLAY_IDS = ['display-number', 'display-status', 'display-detail'];
  for (const { tag, id, className, hidden } of extractIdElements(html)) {
    const el = new FakeElement({ tag, id, className, textContent: extractElementText(html, id) });
    el.parentElement = appEl;
    el.hidden = hidden;
    allElements.push(el);
    if (DISPLAY_IDS.includes(id)) displayEls[id] = el;
  }

  const documentListeners = {};
  const fakeDocument = {
    getElementById(id) { return allElements.find((el) => el.id === id) || null; },
    querySelector(selector) {
      if (selector === '.app') return appEl;
      return allElements.find((el) => matchesSelector(el, selector)) || null;
    },
    querySelectorAll(selector) { return allElements.filter((el) => matchesSelector(el, selector)); },
    addEventListener(type, handler) { documentListeners[type] = handler; },
    _fireDOMContentLoaded() {
      if (documentListeners.DOMContentLoaded) documentListeners.DOMContentLoaded();
    },
  };

  return { fakeDocument, appEl, buttons, displayEls };
}

/**
 * Loads the real, unmodified config.js + calc.js into a fresh vm context
 * wired to a fake document built from the real index.html (same load
 * order as index.html: config.js before calc.js), fires DOMContentLoaded
 * (as a browser would after parsing the page) to run calc.js's own init(),
 * and returns a small driver that clicks the *actual* buttons found in
 * index.html and reads back the *actual* rendered display text.
 *
 * options.localStorage: pass a createFakeLocalStorage() instance to
 * simulate persistence across a "reload" — create one engine, act on it,
 * then create a SECOND engine with the same storage instance to see what
 * the app looks like on next launch. Omit it to get a fresh empty store
 * (equivalent to a first-ever visit).
 *
 * options.haptics: pass a plain { light, medium, error } spy object to
 * observe calc.js's internal haptics classification (Etapa 6) without
 * exporting it as public API. src/platform/haptics.js itself is never
 * loaded here (it has real npm imports, unparseable as a classic vm
 * script) — omit this option to test calc.js exactly as the other 161
 * tests do, with CoreC12Haptics left undefined (a real no-op, same as
 * calc.js's own guard produces when the platform layer isn't loaded).
 *
 * options.entitlementState (Fase 2 — Free/Pro gating): pass a fake
 * object shaped like the real CoreC12EntitlementState global (i.e.
 * exposing createEntitlementState()) to turn gating ON for this
 * engine — calc.js reads isPro from it via subscribe()/getSnapshot().
 * src/platform/purchases.js and the real src/state/entitlement-state.js
 * are never loaded here (StoreKit/Capacitor boundary — see Fase 1's own
 * tests for that layer); this only fakes the JS contract calc.js
 * consumes. Omit it to test calc.js exactly as every pre-Fase-2 test
 * does, with CoreC12EntitlementState left undefined — gating is then
 * fully disabled (see calc.js's own guard), preserving the unrestricted
 * calculator behavior every existing test already relies on.
 *
 * options.proPaywall: pass a plain { requestOpen } spy object to
 * observe the OPEN_PRO_PAYWALL intent calc.js emits when a Pro action
 * is blocked, without wiring any real paywall UI (Fase 4).
 *
 * options.purchases (platform-gating correction): pass a fake
 * { isSupported } object (e.g. { isSupported: () => true }) to control
 * whether calc.js treats this engine as native-with-StoreKit or as
 * Web/PWA — mirrors the real CoreC12Purchases.isSupported() contract
 * from src/platform/purchases.js without loading that file (real npm
 * import, unparseable here). Free/Pro gating only ever activates when
 * BOTH this reports true AND options.entitlementState is set — that is
 * the fix itself: "StoreKit unavailable" must never be treated as
 * "user is Free". Omit it (with options.entitlementState set) to get
 * the Web/PWA case: entitlement exists but gating stays off.
 *
 * src/state/pro-features.js (the Free/Pro matrix) IS always loaded —
 * it is pure and inert (no side effects beyond exposing itself on
 * globalThis) and calc.js only ever reads it from inside the
 * gating branch, which stays unreachable unless options.entitlementState
 * is provided — so loading it unconditionally never changes any
 * pre-Fase-2 test's behavior.
 */
function createEngine(options = {}) {
  if (
    !fs.existsSync(INDEX_HTML_PATH) ||
    !fs.existsSync(CORE_JS_PATH) ||
    !fs.existsSync(STATE_JS_PATH) ||
    !fs.existsSync(PRO_FEATURES_JS_PATH) ||
    !fs.existsSync(STORAGE_JS_PATH) ||
    !fs.existsSync(CONFIG_JS_PATH) ||
    !fs.existsSync(CALC_JS_PATH)
  ) {
    throw new Error('index.html not found at project root, or core/calculator.js, state/calculator-state.js, state/pro-features.js, storage/preferences.js, config.js, calc.js not found in src/');
  }
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const coreSrc = fs.readFileSync(CORE_JS_PATH, 'utf8');
  const stateSrc = fs.readFileSync(STATE_JS_PATH, 'utf8');
  const proFeaturesSrc = fs.readFileSync(PRO_FEATURES_JS_PATH, 'utf8');
  const storageSrc = fs.readFileSync(STORAGE_JS_PATH, 'utf8');
  const configSrc = fs.readFileSync(CONFIG_JS_PATH, 'utf8');
  const calcSrc = fs.readFileSync(CALC_JS_PATH, 'utf8');
  const { fakeDocument, appEl, buttons, displayEls } = buildFakeDocument(html);
  const fakeLocalStorage = options.localStorage || createFakeLocalStorage();

  const sandbox = { document: fakeDocument, console, localStorage: fakeLocalStorage };
  sandbox.window = sandbox; // window === globalThis, as in a real browser
  if (options.haptics) sandbox.CoreC12Haptics = options.haptics;
  if (options.entitlementState) sandbox.CoreC12EntitlementState = options.entitlementState;
  if (options.proPaywall) sandbox.CoreC12ProPaywall = options.proPaywall;
  if (options.purchases) sandbox.CoreC12Purchases = options.purchases;
  vm.createContext(sandbox);
  // Mismo orden de carga que index.html: core (CoreC12Core), state
  // (CoreC12State), la matriz Free/Pro (CoreC12ProFeatures) y storage
  // (CoreC12Preferences) antes que config (CoreC12Config), antes que
  // calc.js, que depende de todos ellos.
  vm.runInContext(coreSrc, sandbox, { filename: 'core/calculator.js' });
  vm.runInContext(stateSrc, sandbox, { filename: 'state/calculator-state.js' });
  vm.runInContext(proFeaturesSrc, sandbox, { filename: 'state/pro-features.js' });
  vm.runInContext(storageSrc, sandbox, { filename: 'storage/preferences.js' });
  vm.runInContext(configSrc, sandbox, { filename: 'config.js' });
  vm.runInContext(calcSrc, sandbox, { filename: 'calc.js' });
  fakeDocument._fireDOMContentLoaded();

  function findButton(matchFn) {
    const btn = buttons.find(matchFn);
    if (!btn) throw new Error('No matching button found in real index.html markup for this action');
    return btn;
  }

  function click(btn) {
    const handler = appEl._listeners.click;
    if (!handler) throw new Error('.app click handler not registered — init() did not run');
    handler({ target: btn });
  }

  return {
    digit(d) { click(findButton((b) => b.dataset.action === 'digit' && b.dataset.value === String(d))); },
    decimalPoint() { click(findButton((b) => b.dataset.action === 'decimal')); },
    operator(op) { click(findButton((b) => b.dataset.action === 'operator' && b.dataset.value === op)); },
    equals() { click(findButton((b) => b.dataset.action === 'equals')); },
    clear() { click(findButton((b) => b.dataset.action === 'clear')); },
    allClear() { click(findButton((b) => b.dataset.action === 'all-clear')); },
    sign() { click(findButton((b) => b.dataset.action === 'sign')); },
    percent() { click(findButton((b) => b.dataset.action === 'percent')); },
    setDecimals(n) { click(findButton((b) => b.dataset.action === 'set-decimals' && b.dataset.decimals === String(n))); },

    // ── V2: selector de dirección (solo modo, no calcula) + tasa (calcula) ──
    setTaxDirection(direction) { click(findButton((b) => b.dataset.action === 'tax-direction' && b.dataset.direction === direction)); },
    taxRate(rate) { click(findButton((b) => b.dataset.action === 'tax-rate' && b.dataset.rate === String(rate))); },
    setMarginDirection(direction) { click(findButton((b) => b.dataset.action === 'margin-direction' && b.dataset.direction === direction)); },
    marginRate(rate) { click(findButton((b) => b.dataset.action === 'margin-rate' && b.dataset.rate === String(rate))); },

    // ── Fase 2B: edición configurable de IVA / margen ──
    editTax()          { click(findButton((b) => b.dataset.action === 'edit-tax')); },
    editMargin()       { click(findButton((b) => b.dataset.action === 'edit-margin')); },
    editDoneTax()      { click(findButton((b) => b.dataset.action === 'edit-done-tax')); },
    editDoneMargin()   { click(findButton((b) => b.dataset.action === 'edit-done-margin')); },
    resetTaxRates()    { click(findButton((b) => b.dataset.action === 'reset-tax')); },
    resetMarginRates() { click(findButton((b) => b.dataset.action === 'reset-margin')); },

    // Lectura genérica de cualquier elemento con id (nuevo en Fase 2B:
    // cabeceras de bloque, fila de acciones, etiqueta de RESTABLECER).
    elementText(id) {
      const el = fakeDocument.getElementById(id);
      if (!el) throw new Error('No element with id="' + id + '" found in real index.html markup');
      return el.textContent;
    },
    elementHidden(id) {
      const el = fakeDocument.getElementById(id);
      if (!el) throw new Error('No element with id="' + id + '" found in real index.html markup');
      return !!el.hidden;
    },
    isActionDisabled(action) {
      const btn = buttons.find((b) => b.dataset.action === action);
      if (!btn) throw new Error('No button with data-action="' + action + '" found in real index.html markup');
      return !!btn.disabled;
    },
    isRateDisabled(action, rate) {
      const btn = findButton((b) => b.dataset.action === action && b.dataset.rate === String(rate));
      return !!btn.disabled;
    },
    isRateActive(action, rate) {
      const btn = findButton((b) => b.dataset.action === action && b.dataset.rate === String(rate));
      return btn.classList.contains('is-active');
    },
    hasClass(action, className) {
      const btn = findButton((b) => b.dataset.action === action);
      return btn.classList.contains(className);
    },
    rateAriaLabel(action, rate) {
      const btn = findButton((b) => b.dataset.action === action && b.dataset.rate === String(rate));
      return btn.getAttribute('aria-label');
    },
    ariaPressed(action, extra) {
      const btn = findButton((b) => b.dataset.action === action && (!extra || extra(b)));
      return btn.getAttribute('aria-pressed');
    },

    // Lectura de estado de los selectores y rótulos dinámicos, para aserciones de UI
    activeTaxDirection() {
      const btn = buttons.find((b) => b.dataset.action === 'tax-direction' && b.classList.contains('is-active'));
      return btn ? btn.dataset.direction : null;
    },
    activeMarginDirection() {
      const btn = buttons.find((b) => b.dataset.action === 'margin-direction' && b.classList.contains('is-active'));
      return btn ? btn.dataset.direction : null;
    },
    taxRateLabel(rate) {
      const btn = buttons.find((b) => b.dataset.action === 'tax-rate' && b.dataset.rate === String(rate));
      return btn ? btn.textContent : null;
    },
    marginRateLabel(rate) {
      const btn = buttons.find((b) => b.dataset.action === 'margin-rate' && b.dataset.rate === String(rate));
      return btn ? btn.textContent : null;
    },
    activeDecimals() {
      const btn = buttons.find((b) => b.dataset.action === 'set-decimals' && b.classList.contains('is-active'));
      return btn ? parseInt(btn.dataset.decimals, 10) : null;
    },
    // Rate values in real DOM order (left-to-right, top-to-bottom) — the
    // physical position -> value mapping, exactly as index.html defines it.
    taxRatesInOrder() {
      return buttons.filter((b) => b.dataset.action === 'tax-rate').map((b) => Number(b.dataset.rate));
    },
    marginRatesInOrder() {
      return buttons.filter((b) => b.dataset.action === 'margin-rate').map((b) => Number(b.dataset.rate));
    },

    // ── Compatibilidad con los 26 tests legacy (Fase 0) ──
    // La interfaz original tenía 6 botones físicos de IVA (+IVA X / -IVA X) y
    // el margen solo tenía dirección directa. La V2 los reemplaza por un
    // selector de dirección + botones de tasa. Estos wrappers reproducen la
    // MISMA secuencia de dos clics reales para que las expectativas
    // matemáticas de los tests legacy sigan sin cambiar (ver Fase 1, sección 14).
    margin(rate) { this.setMarginDirection('forward'); this.marginRate(rate); },
    ivaAdd(rate) { this.setTaxDirection('add'); this.taxRate(rate); },
    ivaSub(rate) { this.setTaxDirection('remove'); this.taxRate(rate); },

    display() {
      return {
        number: displayEls['display-number'].textContent,
        status: displayEls['display-status'].textContent,
        detail: displayEls['display-detail'].textContent,
      };
    },

    // Reverses the real formatDisplayNumber() euro formatting (thousands
    // dots + comma decimal) back into a JS number, purely for assertions.
    numberValue() {
      const text = displayEls['display-number'].textContent;
      if (text === 'Error') return NaN;
      const isNeg = text.startsWith('-');
      const unsigned = isNeg ? text.slice(1) : text;
      const normalized = unsigned.replace(/\./g, '').replace(',', '.');
      const n = parseFloat(normalized);
      return isNeg ? -n : n;
    },

    // Direct reference to the real window.CoreC12Config object running in
    // this engine's sandbox — same process, so no serialization needed.
    // Lets config tests call the real validate*/getDefaults/etc. directly.
    config: sandbox.CoreC12Config,
    // The fake localStorage instance backing this engine (same one passed
    // in via options.localStorage, or the fresh one created for it).
    localStorage: fakeLocalStorage,
  };
}

module.exports = { createEngine, createFakeLocalStorage };
