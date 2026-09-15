'use strict';

const path = require('path');
const { runPowerShellFile } = require('./powershell-runner');
const { scriptsDir } = require('./paths');

async function listStartupItems() {
  const scriptPath = path.join(scriptsDir(), 'list-startup.ps1');
  const raw = await runPowerShellFile(scriptPath, [], 15000);
  const parsed = JSON.parse(raw.trim());
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function toggleStartupItem(id, enabled) {
  const scriptPath = path.join(scriptsDir(), 'toggle-startup.ps1');
  await runPowerShellFile(scriptPath, ['-Id', id, '-Action', enabled ? 'enable' : 'disable'], 15000);
  return { id, enabled };
}

module.exports = { listStartupItems, toggleStartupItem };
