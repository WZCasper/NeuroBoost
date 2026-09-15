'use strict';

const path = require('path');
const { runPowerShellFile } = require('./powershell-runner');
const { scriptsDir } = require('./paths');

/**
 * Best-effort: Windows only allows one "MODIFY_SETTINGS" restore point per
 * 24 hours by default, so this frequently no-ops on a machine that already
 * has a recent one - that's normal, not a failure of NeuroBoost. Never
 * throws; callers should proceed with their real action regardless of the
 * result, this is a safety net, not a gate.
 */
async function createRestorePoint(description) {
  try {
    const scriptPath = path.join(scriptsDir(), 'create-restore-point.ps1');
    await runPowerShellFile(scriptPath, ['-Description', description || 'NeuroBoost'], 30000);
    return { created: true };
  } catch (err) {
    return { created: false, reason: err.message };
  }
}

module.exports = { createRestorePoint };
