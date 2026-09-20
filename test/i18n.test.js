'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RENDERER_DIR = path.join(__dirname, '..', 'src', 'renderer');

// i18n.js is a browser script (it touches window/document), so it is evaluated
// in a sandbox with just enough stubs instead of being imported.
function loadLocales() {
  const source = fs
    .readFileSync(path.join(RENDERER_DIR, 'i18n.js'), 'utf8')
    .replace('window.NeuroBoostI18n', 'globalThis.__i18n');
  const sandbox = {
    window: {},
    document: { addEventListener() {}, querySelectorAll() { return []; } },
    navigator: { language: 'ru' }
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  return sandbox.__i18n.LOCALES;
}

// Keys built at runtime as t('prefix.' + something); they cannot be resolved
// statically, so anything under these prefixes is treated as in use.
const DYNAMIC_PREFIXES = ['page.', 'priority.', 'telemetry.', 'disk.'];

function usedKeys() {
  const code =
    fs.readFileSync(path.join(RENDERER_DIR, 'renderer.js'), 'utf8') +
    fs.readFileSync(path.join(RENDERER_DIR, 'index.html'), 'utf8');
  const keys = new Set();
  for (const m of code.matchAll(/\bt\(\s*['"]([\w.\-]+)['"]/g)) keys.add(m[1]);
  for (const m of code.matchAll(/data-i18n(?:-placeholder|-title)?="([\w.\-]+)"/g)) keys.add(m[1]);
  return keys;
}

test('every locale defines exactly the same keys', () => {
  const locales = loadLocales();
  const names = Object.keys(locales);
  assert.ok(names.length >= 2, 'expected at least two locales');
  const reference = new Set(Object.keys(locales[names[0]]));
  for (const name of names.slice(1)) {
    const keys = new Set(Object.keys(locales[name]));
    assert.deepEqual([...reference].filter((k) => !keys.has(k)), [], `missing in ${name}`);
    assert.deepEqual([...keys].filter((k) => !reference.has(k)), [], `extra in ${name}`);
  }
});

test('no translation is an empty string', () => {
  const locales = loadLocales();
  for (const [name, table] of Object.entries(locales)) {
    for (const [key, value] of Object.entries(table)) {
      assert.ok(typeof value === 'string' && value.trim() !== '', `${name}: ${key} is empty`);
    }
  }
});

test('every key referenced from the renderer exists', () => {
  const locales = loadLocales();
  const missing = [...usedKeys()].filter(
    (k) => !DYNAMIC_PREFIXES.includes(k) && !(k in locales.ru)
  );
  assert.deepEqual(missing, []);
});

test('no key is defined but never used', () => {
  const locales = loadLocales();
  const used = usedKeys();
  const dead = Object.keys(locales.ru).filter(
    (k) => !used.has(k) && !DYNAMIC_PREFIXES.some((p) => k.startsWith(p))
  );
  assert.deepEqual(dead, []);
});

test('placeholders such as {name} match across locales', () => {
  const locales = loadLocales();
  const names = Object.keys(locales);
  const holders = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(locales[names[0]])) {
    const reference = holders(locales[names[0]][key]);
    for (const name of names.slice(1)) {
      assert.deepEqual(holders(locales[name][key]), reference, `${name}: ${key}`);
    }
  }
});
