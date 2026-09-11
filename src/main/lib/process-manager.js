'use strict';

const path = require('path');
const os = require('os');
const { runPowerShell, runPowerShellFile } = require('./powershell-runner');
const { scriptsDir } = require('./paths');

// Win32_PerfFormattedData_PerfProc_Process gives a pre-computed CPU% from
// Windows' own performance counters (no manual two-sample delta needed).
// Get-Process is merged in for PriorityClass and the executable path, since
// the WMI class doesn't expose those. Both calls are cheap CIM/.NET calls —
// intentionally NOT `wmic`, which Microsoft has deprecated and removed by
// default starting with Windows 11 22H2+.
const LIST_SCRIPT = `
$perf = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |
  Where-Object { $_.IDProcess -ne 0 -and $_.Name -notin @('_Total','Idle') }
$procs = Get-Process | Select-Object Id, ProcessName,
  @{n='Priority';e={$_.PriorityClass}},
  @{n='Path';e={ try { $_.Path } catch { $null } }}
$byId = @{}
foreach ($p in $procs) { $byId[$p.Id] = $p }
$result = foreach ($row in $perf) {
  $extra = $byId[[int]$row.IDProcess]
  [pscustomobject]@{
    pid = [int]$row.IDProcess
    name = if ($extra) { $extra.ProcessName } else { $row.Name }
    cpuRaw = [double]$row.PercentProcessorTime
    workingSetMB = [math]::Round($row.WorkingSet / 1MB, 1)
    priority = if ($extra) { [string]$extra.Priority } else { $null }
    path = if ($extra) { $extra.Path } else { $null }
  }
}
ConvertTo-Json -InputObject $result -Compress -Depth 4
`;

const CORE_COUNT = Math.max(os.cpus().length, 1);
const ALLOWED_PRIORITIES = ['Idle', 'BelowNormal', 'Normal', 'AboveNormal', 'High'];

// Executables treated as "heavy foreground" workloads worth boosting when
// auto-boost is on. Matched case-insensitively against the process name
// (without .exe, as PowerShell's ProcessName already strips it).
const HEAVY_APP_NAMES = new Set([
  'obs64',
  'obs32',
  'obs',
  'cs2',
  'csgo',
  'valorant-win64-shipping',
  'r5apex',
  'fortniteclient-win64-shipping',
  'gta5',
  'eldenring',
  'cyberpunk2077',
  'starfield',
  'blender',
  'afterfx',
  'resolve',
  'unrealeditor',
  'unity'
]);

// Background processes safe to gently deprioritize during a boost session.
// Deliberately conservative — never system, security, or driver processes.
const DEPRIORITIZE_NAMES = new Set([
  'onedrive',
  'searchindexer',
  'widgets',
  'yourphone',
  'msteams',
  'skype',
  'spotify',
  'chrome',
  'msedge'
]);

let autoBoostTimer = null;
let autoBoostAdjusted = new Map(); // pid -> priority we bumped it from

async function listProcesses() {
  const raw = await runPowerShell(LIST_SCRIPT, { timeoutMs: 15000 });
  const rows = JSON.parse(raw.trim());
  const arr = Array.isArray(rows) ? rows : [rows];
  return arr
    .map((r) => ({
      pid: r.pid,
      name: r.name,
      cpuPercent: Math.min(100, +(r.cpuRaw / CORE_COUNT).toFixed(1)),
      memoryMB: r.workingSetMB,
      priority: r.priority || 'Normal',
      path: r.path || null
    }))
    .sort((a, b) => b.cpuPercent - a.cpuPercent);
}

async function setProcessPriority(pid, priority) {
  if (!ALLOWED_PRIORITIES.includes(priority)) {
    // RealTime is intentionally excluded — it can starve input/audio
    // drivers and hang the system, which conflicts with "safe optimizer".
    throw new Error(`Priority must be one of: ${ALLOWED_PRIORITIES.join(', ')}`);
  }
  const scriptPath = path.join(scriptsDir(), 'set-priority.ps1');
  await runPowerShellFile(scriptPath, ['-ProcessId', String(pid), '-Priority', priority], 10000);
  return { pid, priority };
}

async function startAutoBoost(options = {}, onEvent) {
  if (autoBoostTimer) return { running: true };

  const intervalMs = Math.max(options.intervalMs || 8000, 3000);

  autoBoostTimer = setInterval(async () => {
    try {
      const procs = await listProcesses();
      const heavy = procs.find((p) => HEAVY_APP_NAMES.has(p.name.toLowerCase()));

      if (heavy && heavy.priority !== 'High' && heavy.priority !== 'RealTime') {
        await setProcessPriority(heavy.pid, 'High');
        autoBoostAdjusted.set(heavy.pid, 'Normal');
        if (onEvent) onEvent({ type: 'boosted', name: heavy.name, pid: heavy.pid });

        for (const p of procs) {
          if (DEPRIORITIZE_NAMES.has(p.name.toLowerCase()) && p.priority === 'Normal') {
            await setProcessPriority(p.pid, 'BelowNormal').catch(() => {});
          }
        }
      }
    } catch (err) {
      if (onEvent) onEvent({ type: 'error', message: err.message });
    }
  }, intervalMs);

  return { running: true };
}

async function stopAutoBoost() {
  if (autoBoostTimer) {
    clearInterval(autoBoostTimer);
    autoBoostTimer = null;
  }
  for (const [pid] of autoBoostAdjusted) {
    await setProcessPriority(pid, 'Normal').catch(() => {});
  }
  autoBoostAdjusted.clear();
  return { running: false };
}

module.exports = { listProcesses, setProcessPriority, startAutoBoost, stopAutoBoost };
