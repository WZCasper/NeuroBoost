'use strict';

const path = require('path');
const { runPowerShell, runPowerShellFile } = require('./powershell-runner');
const { scriptsDir } = require('./paths');

// CPU% is computed from two Get-Process snapshots 400ms apart (classic
// TotalProcessorTime delta), NOT from Win32_PerfFormattedData_PerfProc_Process.
// The WMI performance-counter provider is a well-known source of multi-second
// stalls (and outright hangs) on real-world machines whose perf counters are
// stale or corrupted - Get-Process itself is a plain, fast .NET call with no
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

// Never killable and never auto-boosted as a "generic heavy process" target -
// core OS/security processes. This is the actual safety boundary for
// process:kill, checked server-side regardless of what the renderer sends.
const CRITICAL_NAMES = new Set([
  'system', 'idle', 'registry', 'csrss', 'wininit', 'winlogon', 'services',
  'lsass', 'smss', 'secure system', 'memory compression', 'svchost', 'dwm',
  'explorer', 'securityhealthservice', 'msmpeng', 'nissrv', 'neuroboost'
]);

// Executables treated as "heavy foreground" workloads worth boosting when
// auto-boost is on. Matched case-insensitively against the process name
// (without .exe, as PowerShell's ProcessName already strips it). Checked
// first, before the generic top-CPU fallback below, so a known game/
// renderer always wins even if something else briefly spikes higher.
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
// Deliberately conservative - never system, security, or driver processes.
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

// Minimum CPU% for a process to be considered a "generic heavy process"
// worth boosting when nothing from HEAVY_APP_NAMES is running.
const GENERIC_BOOST_CPU_THRESHOLD = 25;

let autoBoostTimer = null;
let autoBoostTarget = null; // { pid, name } currently boosted to High, or null

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
    // RealTime is intentionally excluded - it can starve input/audio
    // drivers and hang the system, which conflicts with "safe optimizer".
    throw new Error(`Priority must be one of: ${ALLOWED_PRIORITIES.join(', ')}`);
  }
  const scriptPath = path.join(scriptsDir(), 'set-priority.ps1');
  await runPowerShellFile(scriptPath, ['-ProcessId', String(pid), '-Priority', priority], 10000);
  return { pid, priority };
}

/**
 * Ends a process. Re-validates the name against CRITICAL_NAMES itself
 * (never trusts a flag the renderer sends), so this can never be used to
 * kill a core OS/security process even if the UI were tricked into
 * offering it. Uses Node's own process.kill rather than another
 * powershell.exe spawn, since no registry/privileged API access is needed.
 */
async function killProcess(pid, name) {
  const lower = (name || '').toLowerCase();
  if (CRITICAL_NAMES.has(lower)) {
    throw new Error(`Отказ: "${name}" - критический системный процесс.`);
  }
  if (!pid || pid <= 4) {
    throw new Error('Недопустимый PID.');
  }
  try {
    process.kill(pid);
  } catch (err) {
    throw new Error(err && err.message ? err.message : String(err));
  }
  return { pid, killed: true };
}

function pickBoostTarget(procs) {
  const heavy = procs.find((p) => HEAVY_APP_NAMES.has(p.name.toLowerCase()));
  if (heavy) return heavy;
  return procs.find((p) => p.cpuPercent >= GENERIC_BOOST_CPU_THRESHOLD && !CRITICAL_NAMES.has(p.name.toLowerCase()));
}

async function startAutoBoost(options = {}, onEvent) {
  if (autoBoostTimer) return { running: true };

  const intervalMs = Math.max(options.intervalMs || 8000, 3000);

  const tick = async () => {
    try {
      const procs = await listProcesses();
      const target = pickBoostTarget(procs);

      if (target) {
        if (autoBoostTarget && autoBoostTarget.pid !== target.pid) {
          // Focus moved to a different heavy process - relax the old one.
          await setProcessPriority(autoBoostTarget.pid, 'Normal').catch(() => {});
        }

        if (target.priority !== 'High' && target.priority !== 'RealTime') {
          await setProcessPriority(target.pid, 'High');
          if (onEvent) {
            onEvent({ type: 'boosted', name: target.name, pid: target.pid, cpuPercent: target.cpuPercent });
          }
        } else if (onEvent) {
          onEvent({ type: 'holding', name: target.name, pid: target.pid, cpuPercent: target.cpuPercent });
        }
        autoBoostTarget = { pid: target.pid, name: target.name };

        for (const p of procs) {
          if (DEPRIORITIZE_NAMES.has(p.name.toLowerCase()) && p.priority === 'Normal' && p.pid !== target.pid) {
            await setProcessPriority(p.pid, 'BelowNormal').catch(() => {});
          }
        }
      } else {
        if (autoBoostTarget) {
          await setProcessPriority(autoBoostTarget.pid, 'Normal').catch(() => {});
          autoBoostTarget = null;
        }
        const top = procs[0];
        if (onEvent) {
          onEvent({ type: 'idle', topName: top ? top.name : null, topCpu: top ? top.cpuPercent : 0 });
        }
      }
    } catch (err) {
      if (onEvent) onEvent({ type: 'error', message: err.message });
    }
  };

  autoBoostTimer = setInterval(tick, intervalMs);
  tick(); // run once immediately instead of waiting for the first interval

  return { running: true };
}

async function stopAutoBoost() {
  if (autoBoostTimer) {
    clearInterval(autoBoostTimer);
    autoBoostTimer = null;
  }
  if (autoBoostTarget) {
    await setProcessPriority(autoBoostTarget.pid, 'Normal').catch(() => {});
    autoBoostTarget = null;
  }
  return { running: false };
}

module.exports = { listProcesses, setProcessPriority, killProcess, startAutoBoost, stopAutoBoost, CRITICAL_NAMES };
