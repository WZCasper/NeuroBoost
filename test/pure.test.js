'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mergeSettings, mergeTelemetryBackup } = require('../src/main/lib/pure');

test('mergeSettings overlays partial values onto the base without losing untouched keys', () => {
  const base = { a: 1, b: 2, telemetryOptions: { x: false, y: false } };
  const result = mergeSettings(base, { b: 5 });
  assert.deepEqual(result, { a: 1, b: 5, telemetryOptions: { x: false, y: false } });
});

test('mergeSettings deep-merges telemetryOptions instead of replacing the whole object', () => {
  const base = { telemetryOptions: { x: false, y: false } };
  const result = mergeSettings(base, { telemetryOptions: { x: true } });
  assert.deepEqual(result.telemetryOptions, { x: true, y: false });
});

test('mergeTelemetryBackup keeps the original value for a key already backed up (the core bug fix)', () => {
  const existing = [{ path: 'HKLM:\\X', name: 'AllowTelemetry', existed: true, value: 1 }];
  // Simulate a second "apply" run where the registry now already reads 0
  // (from the first apply) - the merge must NOT let this overwrite the
  // true original value of 1.
  const secondRunBackup = [{ path: 'HKLM:\\X', name: 'AllowTelemetry', existed: true, value: 0 }];
  const merged = mergeTelemetryBackup(existing, secondRunBackup);
  assert.deepEqual(merged, existing);
});

test('mergeTelemetryBackup adds a genuinely new key without disturbing existing ones', () => {
  const existing = [{ path: 'HKLM:\\X', name: 'AllowTelemetry', existed: true, value: 1 }];
  const newBackup = [{ path: 'HKCU:\\Y', name: 'TaskbarDa', existed: false, value: null }];
  const merged = mergeTelemetryBackup(existing, newBackup);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0], existing[0]);
  assert.deepEqual(merged[1], newBackup[0]);
});
