'use strict';

const path = require('path');
const os = require('os');
const { runPowerShellFile } = require('./powershell-runner');
const { scriptsDir } = require('./paths');

async function getMemoryInfo() {
  const total = os.totalmem();
  const free = os.freemem();
  return {
    totalGB: +(total / 1024 ** 3).toFixed(2),
    freeGB: +(free / 1024 ** 3).toFixed(2),
    usedGB: +((total - free) / 1024 ** 3).toFixed(2),
    usedPercent: +(((total - free) / total) * 100).toFixed(1)
  };
}

/**
 * Purges the Windows standby list (cached, reclaimable file-backed pages)
 * using the same technique as the well-known open-source "EmptyStandbyList"
 * utility: NtSetSystemInformation(SystemMemoryListInformation=80,
 * MemoryPurgeStandbyList=4), after enabling SeProfileSingleProcessPrivilege
 * on the current process token. Requires an elevated process.
 *
 * Note on expectations: Windows already reports standby pages as "available"
 * in GlobalMemoryStatusEx, so this rarely produces a dramatic jump in the
 * free-memory number. What it actually does is make that memory instantly
 * reusable, which mainly helps right before launching something memory
 * hungry (a game, a render, a large build).
 */
async function purgeStandbyList() {
  const scriptPath = path.join(scriptsDir(), 'purge-standby-list.ps1');
  await runPowerShellFile(scriptPath, [], 15000);
  return getMemoryInfo();
}

module.exports = { getMemoryInfo, purgeStandbyList };
