'use strict';

const path = require('path');
const { runPowerShell, runPowerShellFile } = require('./powershell-runner');
const { scriptsDir } = require('./paths');

// CPU% is computed from two Get-Process snapshots 400ms apart (classic
// TotalProcessorTime delta), NOT from Win32_PerfFormattedData_PerfProc_Process.
// The WMI performance-counter provider is a well-known source of multi-second
// stalls (and outright hangs) on real-world machines whose perf counters are
// stale or corrupted — Get-Process itself is a plain, fast .NET call with no
// such dependency. Every per-process property read is wrapped in try/catch:
// a handful of protected/system processes throw "Access is denied" on
// .PriorityClass or .TotalProcessorTime even for an elevated caller, and one
// such process must never take the whole listing down.
const LIST_SCRIPT = `
$core = [Math]::Max([Environment]::ProcessorCount, 1)

function Snapshot {
  Get-Process | ForEach-Object {
    try {
      [pscustomobject]@{
        Id = $_.Id
        Name = $_.ProcessName
        Cpu = $_.TotalProcessorTime
        Mem = $_.WorkingSet64
        Priority = $(try { $_.PriorityClass.ToString() } catch { $null })
        Path = $(try { $_.Path } catch { $null })
      }
    } catch { $null }
  } | Where-Object { $_ -ne $null }
}

$first = Snapshot
Start-Sleep -Milliseconds 400
$second = Snapshot

$firstById = @{}
foreach ($p in $first) { $firstById[$p.Id] = $p }

$result = foreach ($p in $second) {
  $prev = $firstById[$p.Id]
  if (-not $prev) { continue }
  $deltaMs = 0
  try { $deltaMs = ($p.Cpu - $prev.Cpu).TotalMilliseconds } catch { $deltaMs = 0 }
  $cpuPercent = if ($deltaMs -gt 0) { [Math]::Round(($deltaMs / 400.0) / $core * 100, 1) } else { 0 }
  [pscustomobject]@{
    pid = $p.Id
    name = $p.Name
    cpuPercent = $cpuPercent
    workingSetMB = [Math]::Round($p.Mem / 1MB, 1)
    priority = $p.Priority
    path = $p.Path
  }
}

ConvertTo-Json -InputObject $result -Compress -Depth 4
`;

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

// A manual "Refresh" click and auto-boost's own polling loop can land at the
// same time; without this guard they'd spawn two concurrent powershell.exe
// processes doing the same work. Any caller that arrives while a listing is
// already running just awaits that same in-flight result instead.
let inFlightList = null;

async function listProcesses() {
  if (inFlightList) return inFlightList;

  inFlightList = (async () => {
    try {
      const raw = await runPowerShell(LIST_SCRIPT, { timeoutMs: 12000 });
      const rows = JSON.parse(raw.trim());
      const arr = Array.isArray(rows) ? rows : [rows];
      return arr
        .map((r) => ({
          pid: r.pid,
          name: r.name,
          cpuPercent: Math.min(100, +r.cpuPercent),
          memoryMB: r.workingSetMB,
          priority: r.priority || 'Normal',
          path: r.path || null
        }))
        .sort((a, b) => b.cpuPercent - a.cpuPercent);
    } finally {
      inFlightList = null;
    }
  })();

  return inFlightList;
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
