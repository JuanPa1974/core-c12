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
const CALC_JS_PATH = path.join(ROOT, 'calc.js');

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
    this.classList = new FakeClassList(this);
  }
  addEventListener(type, handler) { this._listeners[type] = handler; }
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
  for (const id of ['display-number', 'display-status', 'display-detail']) {
    const el = new FakeElement({ tag: 'div', id, textContent: extractElementText(html, id) });
    el.parentElement = appEl;
    displayEls[id] = el;
    allElements.push(el);
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
 * Loads the real, unmodified calc.js into a fresh vm context wired to a
 * fake document built from the real index.html, fires DOMContentLoaded
 * (as a browser would after parsing the page) to run calc.js's own init(),
 * and returns a small driver that clicks the *actual* buttons found in
 * index.html and reads back the *actual* rendered display text.
 */
function createEngine() {
  if (!fs.existsSync(INDEX_HTML_PATH) || !fs.existsSync(CALC_JS_PATH)) {
    throw new Error('index.html or calc.js not found next to tests/ — expected at project root');
  }
  const html = fs.readFileSync(INDEX_HTML_PATH, 'utf8');
  const calcSrc = fs.readFileSync(CALC_JS_PATH, 'utf8');
  const { fakeDocument, appEl, buttons, displayEls } = buildFakeDocument(html);

  const sandbox = { document: fakeDocument, console };
  vm.createContext(sandbox);
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
    margin(rate) { click(findButton((b) => b.dataset.action === 'margin' && b.dataset.rate === String(rate))); },
    ivaAdd(rate) { click(findButton((b) => b.dataset.action === 'iva-add' && b.dataset.rate === String(rate))); },
    ivaSub(rate) { click(findButton((b) => b.dataset.action === 'iva-sub' && b.dataset.rate === String(rate))); },
    setDecimals(n) { click(findButton((b) => b.dataset.action === 'set-decimals' && b.dataset.decimals === String(n))); },

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
  };
}

module.exports = { createEngine };
