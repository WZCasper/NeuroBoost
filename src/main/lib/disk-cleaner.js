'use strict';

const path = require('path');
const { runPowerShell, runPowerShellFile } = require('./powershell-runner');
const { scriptsDir } = require('./paths');

async function scanDiskCategories() {
  const scriptPath = path.join(scriptsDir(), 'scan-disk.ps1');
  const raw = await runPowerShellFile(scriptPath, [], 45000);
  const parsed = JSON.parse(raw.trim());
  return Array.isArray(parsed) ? parsed : [parsed];
}

/**
 * Deletes the selected categories. Streams one JSON line per category as
 * it finishes (NDJSON, same pattern as purge-standby-list.ps1) so the UI
 * can show live progress instead of one final blob.
 */
async function cleanDiskCategories(categoryIds, onProgress) {
  if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
    throw new Error('Не выбрано ни одной категории.');
  }
  const scriptPath = path.join(scriptsDir(), 'clean-disk.ps1');
  let summary = null;

  await runPowerShell(scriptPath, {
    asFile: true,
    args: ['-CategoryIds', categoryIds.join(',')],
    timeoutMs: 120000,
    onLine: (line) => {
      let event;
      try {
        event = JSON.parse(line);
      } catch (_) {
        return;
      }
      if (event.event === 'summary') {
        summary = event;
      } else if (onProgress) {
        onProgress(event);
      }
    }
  });

  return summary || { freedBytes: 0, results: [] };
}

module.exports = { scanDiskCategories, cleanDiskCategories };
