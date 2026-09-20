'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml } = require('../src/renderer/escape');

test('escapes the characters that break out of element content', () => {
  assert.equal(escapeHtml('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(escapeHtml('a & b'), 'a &amp; b');
});

test('escapes quotes so a value cannot break out of an HTML attribute (regression)', () => {
  const evil = 'x" onmouseover="alert(1)" data-x="';
  const html = '<td title="' + escapeHtml(evil) + '">';
  assert.equal(html.includes('" onmouseover="'), false);
  assert.equal((html.match(/"/g) || []).length, 2, 'only the two delimiters of title="..." may remain');

  const single = "x' onmouseover='alert(1)";
  assert.equal(escapeHtml(single).includes("'"), false);
});

test('escapes backticks (legacy attribute parsing) ', () => {
  assert.equal(escapeHtml('`x`'), '&#96;x&#96;');
});

test('escapes ampersands first so entities in the input are not double-decoded', () => {
  assert.equal(escapeHtml('&lt;'), '&amp;lt;');
});

test('null and undefined become empty string; other falsy values are preserved', () => {
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml(false), 'false');
});

test('leaves ordinary text, including Cyrillic, untouched', () => {
  assert.equal(escapeHtml('Приложения Windows 11'), 'Приложения Windows 11');
});
