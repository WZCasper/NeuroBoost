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

module.exports = { mergeSettings, mergeTelemetryBackup };
