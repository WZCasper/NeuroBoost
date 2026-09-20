'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isAllowedExternalUrl } = require('../src/main/lib/pure');

test('allows the project repository and pages beneath it', () => {
  assert.equal(isAllowedExternalUrl('https://github.com/WZCasper/NeuroBoost'), true);
  assert.equal(isAllowedExternalUrl('https://github.com/WZCasper/NeuroBoost/releases'), true);
  assert.equal(isAllowedExternalUrl('https://github.com/WZCasper/NeuroBoost/issues/1'), true);
});

test('rejects non-https schemes, including ones that execute code or open local files', () => {
  for (const url of [
    'http://github.com/WZCasper/NeuroBoost',
    'file:///C:/Windows/System32/cmd.exe',
    'javascript:alert(1)',
    'ms-msdt:/id PCWDiagnostic',
    'search-ms:query=x',
    'data:text/html,<script>alert(1)</script>',
    'ftp://github.com/WZCasper/NeuroBoost'
  ]) {
    assert.equal(isAllowedExternalUrl(url), false, url);
  }
});

test('rejects other hosts, look-alike hosts and userinfo tricks', () => {
  for (const url of [
    'https://evil.example/WZCasper/NeuroBoost',
    'https://github.com.evil.example/WZCasper/NeuroBoost',
    'https://notgithub.com/WZCasper/NeuroBoost',
    'https://github.com@evil.example/WZCasper/NeuroBoost',
    'https://user:pass@github.com/WZCasper/NeuroBoost',
    'https://github.com:8443/WZCasper/NeuroBoost'
  ]) {
    assert.equal(isAllowedExternalUrl(url), false, url);
  }
});

test('rejects sibling repositories that merely share a name prefix', () => {
  assert.equal(isAllowedExternalUrl('https://github.com/WZCasper/NeuroBoostEvil'), false);
  assert.equal(isAllowedExternalUrl('https://github.com/WZCasper/NeuroBoost-fork'), false);
  assert.equal(isAllowedExternalUrl('https://github.com/WZCasper'), false);
});

test('path traversal cannot escape the allowed prefix after URL normalisation', () => {
  assert.equal(isAllowedExternalUrl('https://github.com/WZCasper/NeuroBoost/../../evil/repo'), false);
  assert.equal(isAllowedExternalUrl('https://github.com/WZCasper/NeuroBoost/%2e%2e/%2e%2e/evil'), false);
});

test('rejects non-string and malformed input without throwing', () => {
  for (const value of [undefined, null, 42, {}, [], '', 'not a url', '//github.com/WZCasper/NeuroBoost']) {
    assert.equal(isAllowedExternalUrl(value), false, String(value));
  }
});
