'use strict';

const path = require('path');
const { app } = require('electron');
const { runPowerShellFile } = require('./powershell-runner');
const { scriptsDir } = require('./paths');

function scriptPath() {
  return path.join(scriptsDir(), 'set-autostart.ps1');
}

/**
 * Reads the real current state from the scheduled task rather than trusting
 * a stored setting - the task can be removed by the user, another tool, or
 * a failed write, and the UI should reflect what is actually true.
 */
async function getAutostartStatus() {
  try {
    const raw = await runPowerShellFile(scriptPath(), ['-Action', 'status'], 15000);
    return !!JSON.parse(raw.trim()).enabled;
  } catch (_) {
    return false;
  }
}

async function setAutostart(enabled) {
  const args = enabled
    ? ['-Action', 'enable', '-ExePath', app.getPath('exe')]
    : ['-Action', 'disable'];
  const raw = await runPowerShellFile(scriptPath(), args, 20000);
  return !!JSON.parse(raw.trim()).enabled;
}

module.exports = { getAutostartStatus, setAutostart };
