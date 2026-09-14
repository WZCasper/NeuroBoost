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
 *
 * The script streams one JSON line per action *as it happens* (not buffered
 * until the end); onProgress(event) is called live for each one, so the UI
 * can show real-time proof of work instead of just a final "Done" message.
 * Returns real before/after memory stats plus how many processes were
 * actually trimmed.
 */
async function purgeStandbyList(onProgress) {
  const before = await getMemoryInfo();

  const scriptPath = path.join(scriptsDir(), 'purge-standby-list.ps1');
  let summary = null;

  const raw = await runPowerShellFile(scriptPath, [], 30000, (line) => {
    let event;
    try {
      event = JSON.parse(line);
    } catch (_) {
      return; // ignore any non-JSON stray output line
    }
    if (event.event === 'summary') {
      summary = event;
    } else if (onProgress) {
      onProgress(event);
    }
  });

  let stats = summary;
  if (!stats) {
    // Fallback in case streaming missed the summary line for any reason -
    // the full buffered stdout still has it as the last line.
    try {
      const lines = raw.trim().split('\n').filter(Boolean);
      stats = JSON.parse(lines[lines.length - 1]);
    } catch (_) {
      stats = { standbyPurged: false, trimmedCount: 0, trimmedNames: [] };
    }
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
