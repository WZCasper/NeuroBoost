'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeProcessName, toNameSet, isBackgroundApp,
  planBackgroundLowering, planPriorityRestore,
  CRITICAL_NAMES, HEAVY_APP_NAMES, DEPRIORITIZE_NAMES
} = require('../src/main/lib/pure');

const proc = (pid, name, priority = 'Normal') => ({ pid, name, priority, cpuPercent: 0, memoryMB: 0 });

test('normalizeProcessName trims, lower-cases and strips one trailing .exe', () => {
  assert.equal(normalizeProcessName('Chrome.exe '), 'chrome');
  assert.equal(normalizeProcessName('  OneDrive'), 'onedrive');
  assert.equal(normalizeProcessName('MsMpEng.EXE'), 'msmpeng');
  assert.equal(normalizeProcessName('weird.exe.exe'), 'weird.exe');
  for (const empty of [null, undefined, '', '   ', '.exe']) {
    assert.equal(normalizeProcessName(empty), '', String(empty));
  }
});

test('toNameSet tolerates garbage from a hand-edited settings file', () => {
  assert.deepEqual([...toNameSet(['Chrome.exe', 'chrome', ' Steam ', '', null, 42])].sort(), ['42', 'chrome', 'steam']);
  assert.equal(toNameSet(undefined).size, 0);
  assert.equal(toNameSet('chrome').size, 0);
  assert.equal(toNameSet({}).size, 0);
});

test('built-in background list is recognised, unknown programs are not', () => {
  for (const name of DEPRIORITIZE_NAMES) assert.equal(isBackgroundApp(name), true, name);
  assert.equal(isBackgroundApp('SomeRandomProgram'), false);
  assert.equal(isBackgroundApp(''), false);
  assert.equal(isBackgroundApp(null), false);
});

test("the person's own list is honoured, with .exe and any case", () => {
  const custom = toNameSet(['Notepad++.exe', 'MyUpdater']);
  assert.equal(isBackgroundApp('notepad++', { customBackground: custom }), true);
  assert.equal(isBackgroundApp('MYUPDATER.EXE', { customBackground: custom }), true);
  assert.equal(isBackgroundApp('other', { customBackground: custom }), false);
});

test('NO critical process can ever be lowered, even if the person lists it (covers Defender)', () => {
  assert.ok(CRITICAL_NAMES.has('msmpeng') && CRITICAL_NAMES.has('securityhealthservice') && CRITICAL_NAMES.has('nissrv'),
    'Windows Defender processes must be in the never-touch set');
  for (const name of CRITICAL_NAMES) {
    const custom = toNameSet([name, name + '.exe']);
    assert.equal(isBackgroundApp(name, { customBackground: custom }), false, name);
    assert.equal(isBackgroundApp(name.toUpperCase() + '.EXE', { customBackground: custom }), false, name);
  }
});

test('a boost target is never also background', () => {
  const heavy = [...HEAVY_APP_NAMES][0];
  assert.equal(isBackgroundApp(heavy, { customBackground: toNameSet([heavy]) }), false);
  assert.equal(isBackgroundApp('mygame', { customBackground: toNameSet(['mygame']), customHeavy: toNameSet(['mygame']) }), false);
});

test('planBackgroundLowering skips the target, skips non-Normal priorities, includes custom names', () => {
  const procs = [
    proc(1, 'game'), proc(2, 'chrome'), proc(3, 'Spotify'), proc(4, 'onedrive', 'High'),
    proc(5, 'mytool'), proc(6, 'explorer'), proc(7, 'msmpeng'), proc(8, 'chrome', 'BelowNormal')
  ];
  const plan = planBackgroundLowering(procs, procs[0], { customBackground: toNameSet(['mytool', 'explorer', 'msmpeng']) });
  assert.deepEqual(plan.map((p) => p.pid), [2, 3, 5]);
  assert.deepEqual(plan.map((p) => p.name), ['chrome', 'spotify', 'mytool']);
});

test('planBackgroundLowering never lowers the target even when it matches a background name', () => {
  const procs = [proc(2, 'chrome'), proc(9, 'chrome')];
  assert.deepEqual(planBackgroundLowering(procs, procs[0], {}).map((p) => p.pid), [9]);
});

test('planPriorityRestore restores only what is still the same program on BelowNormal', () => {
  const lowered = new Map([[2, 'chrome'], [3, 'spotify'], [4, 'onedrive'], [5, 'teams'], [6, 'skype']]);
  const procs = [
    proc(2, 'chrome', 'BelowNormal'),   // untouched since we lowered it -> restore
    proc(3, 'Spotify', 'BelowNormal'),  // name case differs only -> restore
    proc(4, 'notepad', 'BelowNormal'),  // pid reused by a different program -> leave alone
    proc(5, 'teams', 'High')            // person changed it meanwhile -> leave alone
    // pid 6 is gone entirely -> nothing to restore
  ];
  assert.deepEqual(planPriorityRestore(lowered, procs), [2, 3]);
});

test('planPriorityRestore with nothing recorded does nothing', () => {
  assert.deepEqual(planPriorityRestore(new Map(), [proc(1, 'chrome', 'BelowNormal')]), []);
});

test('every Teams client that is actually in use is covered, but not its calling child process', () => {
  // Classic client: Teams.exe. Current client: ms-teams.exe. Windows 11's
  // built-in chat: Msteams.exe. (Verified against Microsoft's own advisory
  // MC1189656 and independent write-ups.) ms-teams_modulehost.exe hosts the
  // CALLING stack - lowering it could degrade audio for someone talking in a
  // call while gaming, so it is deliberately not on the list.
  for (const name of ['teams', 'ms-teams', 'msteams']) {
    assert.equal(isBackgroundApp(name), true, name);
    assert.equal(isBackgroundApp(name + '.exe'), true, name + '.exe');
  }
  assert.equal(isBackgroundApp('ms-teams_modulehost'), false);
});
