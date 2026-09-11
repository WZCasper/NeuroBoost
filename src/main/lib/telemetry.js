'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { runPowerShellFile } = require('./powershell-runner');
const { scriptsDir } = require('./paths');

function backupFilePath() {
  return path.join(app.getPath('userData'), 'telemetry-backup.json');
}

async function getTelemetryStatus() {
  return { customized: fs.existsSync(backupFilePath()) };
}

/**
 * Applies telemetry-reducing changes. Every value the script is about to
 * touch is read and recorded *before* being changed, so restoreTelemetry()
 * can put the machine back exactly the way it was — instead of guessing at
 * "Windows defaults", which vary by edition and build.
 */
async function disableTelemetry(options = {}) {
  const args = [];
  if (options.disableWidgets) args.push('-DisableWidgets');
  if (options.disableCopilot) args.push('-DisableCopilot');
  if (options.disableCortana) args.push('-DisableCortana');
  if (options.disableAdvertisingId) args.push('-DisableAdvertisingId');

  const scriptPath = path.join(scriptsDir(), 'disable-telemetry.ps1');
  const raw = await runPowerShellFile(scriptPath, args, 30000);

  let backup;
  try {
    backup = JSON.parse(raw.trim());
  } catch (err) {
    throw new Error('Telemetry script returned unexpected output: ' + err.message);
  }

  fs.writeFileSync(backupFilePath(), JSON.stringify(backup, null, 2), 'utf8');
  return { changed: Array.isArray(backup) ? backup.length : 0 };
}

async function restoreTelemetry() {
  const backupPath = backupFilePath();
  if (!fs.existsSync(backupPath)) {
    throw new Error('No telemetry backup found — nothing to restore.');
  }
  const scriptPath = path.join(scriptsDir(), 'enable-telemetry.ps1');
  await runPowerShellFile(scriptPath, ['-BackupFilePath', backupPath], 30000);
  fs.unlinkSync(backupPath);
  return { restored: true };
}

module.exports = { getTelemetryStatus, disableTelemetry, restoreTelemetry };
