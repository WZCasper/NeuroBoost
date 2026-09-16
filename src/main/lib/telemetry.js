'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { mergeTelemetryBackup } = require('./pure');
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
 * can put the machine back exactly the way it was - instead of guessing at
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

  let parsed;
  try {
    parsed = JSON.parse(raw.trim());
  } catch (err) {
    throw new Error('Telemetry script returned unexpected output: ' + err.message);
  }

  const backup = Array.isArray(parsed.backup) ? parsed.backup : parsed.backup ? [parsed.backup] : [];
  const results = Array.isArray(parsed.results) ? parsed.results : parsed.results ? [parsed.results] : [];

  if (backup.length > 0) {
    // Merge with any existing backup instead of overwriting it: if the app
    // already has original values recorded for a key from a previous apply,
    // keep those (they're the TRUE pre-NeuroBoost state) and only add
    // entries for keys touched for the first time in this run. Without
    // this, applying twice would silently replace the original backup with
    // "already-reduced" values, and Restore defaults would restore to the
    // wrong state.
    let merged = backup;
    const backupPath = backupFilePath();
    if (fs.existsSync(backupPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        merged = mergeTelemetryBackup(existing, backup);
      } catch (_) {
        // Existing backup is unreadable/corrupt - fall back to just this run's backup.
      }
    }
    fs.writeFileSync(backupPath, JSON.stringify(merged, null, 2), 'utf8');
  }

  return {
    changed: results.filter((r) => r.status === 'changed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results
  };
}

async function restoreTelemetry() {
  const backupPath = backupFilePath();
  if (!fs.existsSync(backupPath)) {
    throw new Error('No telemetry backup found - nothing to restore.');
  }
  const scriptPath = path.join(scriptsDir(), 'enable-telemetry.ps1');
  await runPowerShellFile(scriptPath, ['-BackupFilePath', backupPath], 30000);
  fs.unlinkSync(backupPath);
  return { restored: true };
}

module.exports = { getTelemetryStatus, disableTelemetry, restoreTelemetry };
