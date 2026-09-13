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
 * Runs two real Windows memory operations - not a simulation - see the
 * comments at the top of purge-standby-list.ps1 for exactly what each one
 * does and why neither can cause data loss:
 *   1. Purges the standby list (NtSetSystemInformation).
 *   2. Trims the working set of eligible running processes (EmptyWorkingSet)
 *      - this is the part that actually moves the "used memory" number,
 *      since Windows already counts standby pages as "available".
 * Returns real before/after memory stats plus how many processes were
 * actually trimmed, so the result is independently checkable rather than
 * just a "Done" message.
 */
async function purgeStandbyList() {
  const before = await getMemoryInfo();

  const scriptPath = path.join(scriptsDir(), 'purge-standby-list.ps1');
  const raw = await runPowerShellFile(scriptPath, [], 30000);

  let stats = { standbyPurged: false, trimmedCount: 0, trimmedNames: [] };
  try {
    stats = JSON.parse(raw.trim());
  } catch (_) {
    // Keep the defaults above - the memory stats below are still real
    // and useful even if this specific parse failed.
  }

  const after = await getMemoryInfo();

  return {
    ...after,
    beforeUsedGB: before.usedGB,
    freedGB: +Math.max(0, before.usedGB - after.usedGB).toFixed(2),
    standbyPurged: !!stats.standbyPurged,
    trimmedCount: stats.trimmedCount || 0,
    trimmedNames: Array.isArray(stats.trimmedNames) ? stats.trimmedNames : []
  };
}

module.exports = { getMemoryInfo, purgeStandbyList };
