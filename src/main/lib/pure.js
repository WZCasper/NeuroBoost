'use strict';

/**
 * Pure, Electron-independent logic extracted out of settings.js and
 * telemetry.js specifically so it can be unit-tested with plain
 * `node --test` (requiring those files directly would fail outside an
 * Electron process, since they load the `electron` module at the top for
 * app.getPath).
 */

function mergeSettings(base, partial) {
  return {
    ...base,
    ...partial,
    telemetryOptions: { ...base.telemetryOptions, ...(partial.telemetryOptions || {}) }
  };
}

function mergeTelemetryBackup(existing, newBackup) {
  const existingKeys = new Set(existing.map((e) => e.path + '|' + e.name));
  const newOnly = newBackup.filter((e) => !existingKeys.has(e.path + '|' + e.name));
  return existing.concat(newOnly);
}

// --- Auto-Boost target selection -----------------------------------------
// Lives here (rather than in process-manager.js) so it can be unit-tested
// without pulling in Electron: process-manager requires paths.js, which
// requires the electron module and therefore can't load under plain Node.

const CRITICAL_NAMES = new Set([
  'system', 'idle', 'registry', 'csrss', 'wininit', 'winlogon', 'services',
  'lsass', 'smss', 'secure system', 'memory compression', 'svchost', 'dwm',
  'explorer', 'securityhealthservice', 'msmpeng', 'nissrv', 'neuroboost'
]);

const HEAVY_APP_NAMES = new Set([
  'obs64', 'obs32', 'obs', 'cs2', 'csgo', 'valorant-win64-shipping', 'r5apex',
  'fortniteclient-win64-shipping', 'gta5', 'eldenring', 'cyberpunk2077',
  'starfield', 'blender', 'afterfx', 'resolve', 'unrealeditor', 'unity'
]);

const DEPRIORITIZE_NAMES = new Set([
  'onedrive', 'searchindexer', 'widgets', 'yourphone', 'msteams', 'skype',
  'spotify', 'chrome', 'msedge'
]);

/**
 * Chooses which process Auto-Boost should raise to High, if any.
 * A known heavy app (or a user-configured one) always wins; otherwise the
 * highest-CPU non-critical process above the threshold is used.
 */
function pickBoostTarget(procs, { cpuThreshold = 25, customHeavyApps = new Set() } = {}) {
  const custom = customHeavyApps instanceof Set ? customHeavyApps : new Set(customHeavyApps || []);
  const heavy = procs.find((p) => {
    const n = p.name.toLowerCase();
    return HEAVY_APP_NAMES.has(n) || custom.has(n);
  });
  if (heavy) return heavy;
  return procs.find((p) => p.cpuPercent >= cpuThreshold && !CRITICAL_NAMES.has(p.name.toLowerCase()));
}

module.exports = { mergeSettings, mergeTelemetryBackup, pickBoostTarget, CRITICAL_NAMES, HEAVY_APP_NAMES, DEPRIORITIZE_NAMES };
