'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { pickBoostTarget, setAutoBoostConfig } = require('../src/main/lib/process-manager');

function proc(overrides) {
  return { pid: 100, name: 'test', cpuPercent: 0, memoryMB: 10, priority: 'Normal', path: null, ...overrides };
}

test('pickBoostTarget picks a known heavy app even if something else has higher CPU', () => {
  const procs = [proc({ name: 'chrome', cpuPercent: 60 }), proc({ name: 'obs64', cpuPercent: 10 })];
  const target = pickBoostTarget(procs);
  assert.equal(target.name, 'obs64');
});

test('pickBoostTarget falls back to the top non-critical process above the CPU threshold', () => {
  setAutoBoostConfig({ cpuThreshold: 25, customHeavyApps: [] });
  const procs = [proc({ name: 'somegame', cpuPercent: 40 }), proc({ name: 'idletool', cpuPercent: 5 })];
  const target = pickBoostTarget(procs);
  assert.equal(target.name, 'somegame');
});

test('pickBoostTarget never selects a critical system process as the generic fallback', () => {
  setAutoBoostConfig({ cpuThreshold: 25, customHeavyApps: [] });
  const procs = [proc({ name: 'svchost', cpuPercent: 90 }), proc({ name: 'lsass', cpuPercent: 80 })];
  const target = pickBoostTarget(procs);
  assert.equal(target, undefined);
});

test('pickBoostTarget returns nothing when everything is below the configured threshold', () => {
  setAutoBoostConfig({ cpuThreshold: 50, customHeavyApps: [] });
  const procs = [proc({ name: 'somegame', cpuPercent: 40 })];
  const target = pickBoostTarget(procs);
  assert.equal(target, undefined);
});

test('pickBoostTarget respects a user-configured custom heavy app regardless of CPU', () => {
  setAutoBoostConfig({ cpuThreshold: 90, customHeavyApps: ['my_custom_tool'] });
  const procs = [proc({ name: 'my_custom_tool', cpuPercent: 5 }), proc({ name: 'other', cpuPercent: 3 })];
  const target = pickBoostTarget(procs);
  assert.equal(target.name, 'my_custom_tool');
});
