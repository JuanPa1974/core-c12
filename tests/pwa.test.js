'use strict';

/*
 * Structural checks for the PWA identity introduced in Fase 3: manifest
 * JSON shape, that every referenced icon file actually exists on disk (no
 * 404s), and that index.html/service-worker.js stay coherent with it.
 *
 * These are file/JSON-structure assertions, not browser behavior — cheap,
 * deterministic, and immune to the usual "fragile browser metadata test"
 * trap. They don't replace the manual manifest/service-worker validation
 * in a real browser (see the Fase 3 report), only guard the parts that
 * are easy to regress silently (a renamed icon file, a typo'd path, an
 * apple-touch-icon pointing at a format iOS doesn't actually support).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const manifestRaw = fs.readFileSync(path.join(ROOT, 'public', 'manifest.webmanifest'), 'utf8');
const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const swSource = fs.readFileSync(path.join(ROOT, 'service-worker.js'), 'utf8');

test('manifest: es JSON valido con los campos de identidad esperados', () => {
  const manifest = JSON.parse(manifestRaw);
  assert.equal(manifest.name, 'Core C12 — Calculadora Comercial Profesional');
  assert.equal(manifest.short_name, 'Core C12');
  assert.equal(typeof manifest.description, 'string');
  assert.ok(manifest.description.length > 0);
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.theme_color, '#111111');
  assert.equal(manifest.background_color, '#1A1A1A');
});

test('manifest: expone exactamente los 3 iconos PNG requeridos (192 any, 512 any, 512 maskable)', () => {
  const manifest = JSON.parse(manifestRaw);
  assert.equal(manifest.icons.length, 3);

  const bySize = Object.fromEntries(manifest.icons.map((i) => [i.sizes + ':' + i.purpose, i]));
  assert.ok(bySize['192x192:any'], 'falta icono 192x192 purpose any');
  assert.ok(bySize['512x512:any'], 'falta icono 512x512 purpose any');
  assert.ok(bySize['512x512:maskable'], 'falta icono 512x512 purpose maskable');

  for (const icon of manifest.icons) {
    assert.equal(icon.type, 'image/png');
  }
});

test('manifest: todos los iconos referenciados existen realmente en disco (sin 404)', () => {
  const manifest = JSON.parse(manifestRaw);
  for (const icon of manifest.icons) {
    const filePath = path.join(ROOT, 'public', icon.src.replace(/^\//, ''));
    assert.ok(fs.existsSync(filePath), `icono referenciado pero ausente: ${icon.src}`);
  }
});

test('index.html: apple-touch-icon apunta a un PNG, nunca a un SVG (iOS no soporta SVG ahi)', () => {
  const match = indexHtml.match(/<link\s+rel="apple-touch-icon"\s+href="([^"]+)"/);
  assert.ok(match, 'no se encontro <link rel="apple-touch-icon"> en index.html');
  assert.match(match[1], /\.png$/i);

  const filePath = path.join(ROOT, 'public', match[1].replace(/^\//, ''));
  assert.ok(fs.existsSync(filePath), `apple-touch-icon referenciado pero ausente: ${match[1]}`);
});

test('index.html: favicon y titulo presentes y coherentes con la identidad Core C12', () => {
  assert.match(indexHtml, /<link\s+rel="icon"[^>]*href="\/icons\/core-c12-icon\.svg"/);
  assert.match(indexHtml, /<title>Core C12<\/title>/);
  assert.match(indexHtml, /<meta name="apple-mobile-web-app-title" content="Core C12">/);
});

test('service-worker: el app shell incluye todos los iconos que el manifest referencia', () => {
  const manifest = JSON.parse(manifestRaw);
  for (const icon of manifest.icons) {
    assert.ok(
      swSource.includes(`'${icon.src}'`),
      `service-worker.js no cachea el icono del manifest: ${icon.src}`
    );
  }
});
