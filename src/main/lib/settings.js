'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  autoBoostEnabledOnLaunch: false,
  autoBoostCpuThreshold: 25,
  customHeavyApps: [], // extra process names (without .exe) the user wants auto-boosted
  startWithWindows: false,
  minimizeToTray: true,
  telemetryOptions: {
    disableAdvertisingId: false,
    disableCortana: false,
    disableWidgets: false,
    disableCopilot: false
  }
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function getSettings() {
  try {
    const raw = fs.readFileSync(settingsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed, telemetryOptions: { ...DEFAULTS.telemetryOptions, ...(parsed.telemetryOptions || {}) } };
  } catch (_) {
    return { ...DEFAULTS };
  }
}

function updateSettings(partial) {
  const current = getSettings();
  const next = {
    ...current,
    ...partial,
    telemetryOptions: { ...current.telemetryOptions, ...(partial.telemetryOptions || {}) }
  };
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = { getSettings, updateSettings, DEFAULTS };
