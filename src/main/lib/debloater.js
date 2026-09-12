'use strict';

const path = require('path');
const { runPowerShell, runPowerShellFile } = require('./powershell-runner');
const { scriptsDir } = require('./paths');

/**
 * Returns apps ACTUALLY installed on this machine and safe to remove.
 * The filtering (NonRemovable / framework / resource / denylist) happens
 * inside list-appx.ps1, and is re-checked again inside remove-appx.ps1 at
 * removal time — the list returned here is for display, not itself the
 * security boundary.
 */
async function listRemovableApps() {
  const scriptPath = path.join(scriptsDir(), 'list-appx.ps1');
  const raw = await runPowerShellFile(scriptPath, [], 30000);
  const parsed = JSON.parse(raw.trim());
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function removeApps(ids, onProgress) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('Не выбрано ни одного приложения.');
  }

  const scriptPath = path.join(scriptsDir(), 'remove-appx.ps1');
  const results = [];

  for (const id of ids) {
    if (onProgress) onProgress({ id, name: id, status: 'running' });
    try {
      await runPowerShellFile(scriptPath, ['-PackageFamilyName', id], 45000);
      results.push({ id, name: id, status: 'removed' });
      if (onProgress) onProgress({ id, name: id, status: 'removed' });
    } catch (err) {
      results.push({ id, name: id, status: 'failed', error: err.message });
      if (onProgress) onProgress({ id, name: id, status: 'failed', error: err.message });
    }
  }

  return results;
}

module.exports = { listRemovableApps, removeApps };
