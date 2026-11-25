'use strict';

const path = require('path');
const { runPowerShellFile } = require('./powershell-runner');
const { scriptsDir } = require('./paths');
const { listProcessesViaWorker, stopWorker: stopProcessWorker } = require('./process-worker');
const {
  pickBoostTarget: pickBoostTargetPure, CRITICAL_NAMES, HEAVY_APP_NAMES,
  toNameSet, planBackgroundLowering, planPriorityRestore
} = require('./pure');

// Process listing runs through a long-lived PowerShell worker
// (process-worker.js) instead of spawning a fresh powershell.exe on every
// call: Auto-Boost polls every few seconds indefinitely, and starting a new
// PowerShell process each time is real, avoidable overhead. See
// list-processes-worker.ps1 for the actual snapshot/CPU% logic (unchanged
// from before - just moved into a process that stays alive).

const ALLOWED_PRIORITIES = ['Idle', 'BelowNormal', 'Normal', 'AboveNormal', 'High'];

// Never killable and never auto-boosted as a "generic heavy process" target -
// core OS/security processes. This is the actual safety boundary for
// process:kill, checked server-side regardless of what the renderer sends.

// Executables treated as "heavy foreground" workloads worth boosting when
// auto-boost is on. Matched case-insensitively against the process name
// (without .exe, as PowerShell's ProcessName already strips it). Checked
// first, before the generic top-CPU fallback below, so a known game/
// renderer always wins even if something else briefly spikes higher.

// Background processes safe to gently deprioritize during a boost session.
// Deliberately conservative - never system, security, or driver processes.

// Minimum CPU% for a process to be considered a "generic heavy process"
// worth boosting when nothing from HEAVY_APP_NAMES is running. Mutable -
// see setAutoBoostConfig, driven by user settings.
let genericBoostCpuThreshold = 25;
let customHeavyAppNames = new Set();
let customBackgroundAppNames = new Set();

function setAutoBoostConfig({ cpuThreshold, customHeavyApps, customBackgroundApps } = {}) {
  if (typeof cpuThreshold === 'number' && cpuThreshold > 0 && cpuThreshold <= 100) {
    genericBoostCpuThreshold = cpuThreshold;
  }
  // Both lists go through the same normalisation (trim, lower-case, strip a
  // trailing ".exe"), so typing "Chrome.exe" works the same as "chrome".
  if (Array.isArray(customHeavyApps)) {
    customHeavyAppNames = toNameSet(customHeavyApps);
  }
  if (Array.isArray(customBackgroundApps)) {
    customBackgroundAppNames = toNameSet(customBackgroundApps);
  }
}

let autoBoostTimer = null;
let autoBoostTarget = null; // { pid, name } currently boosted to High, or null
// pid -> normalised name of every background app Auto-Boost lowered during
// the current boost session, so exactly those (and nothing else) are put back.
const loweredByBoost = new Map();

// A manual "Refresh" click and auto-boost's own polling loop can land at the
// same time; without this guard they'd spawn two concurrent powershell.exe
// processes doing the same work. Any caller that arrives while a listing is
// already running just awaits that same in-flight result instead.
let inFlightList = null;

async function listProcesses() {
  if (inFlightList) return inFlightList;

  inFlightList = (async () => {
    try {
      const rows = await listProcessesViaWorker();
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
  // Try a graceful close first (CloseMainWindow lets the app run its own
  // save/confirm logic), and only escalate to a hard kill if it is still
  // running after a grace period. A hard kill straight away guarantees data
  // loss in anything with unsaved work.
  const scriptPath = path.join(scriptsDir(), 'stop-process.ps1');
  try {
    const raw = await runPowerShellFile(scriptPath, ['-ProcessId', String(pid)], 15000);
    const result = JSON.parse(raw.trim());
    return { pid, killed: true, method: result.method };
  } catch (err) {
    throw new Error(err && err.message ? err.message : String(err));
  }
}

function pickBoostTarget(procs) {
  return pickBoostTargetPure(procs, { cpuThreshold: genericBoostCpuThreshold, customHeavyApps: customHeavyAppNames });
}

// Puts back everything Auto-Boost lowered once the boost session ends (game
// closed, or Auto-Boost switched off). Before this existed the background
// apps simply stayed on BelowNormal until they were restarted.
// See planPriorityRestore for the two safety checks (same program, still on
// BelowNormal). If the process list cannot be read the record is kept, so a
// later attempt can still restore them instead of forgetting them.
async function restoreLoweredApps(procs) {
  if (loweredByBoost.size === 0) return;
  let current = procs;
  if (!current) {
    try {
      current = await listProcesses();
    } catch (_) {
      return;
    }
  }
  const toRestore = planPriorityRestore(loweredByBoost, current);
  loweredByBoost.clear();
  for (const pid of toRestore) {
    await setProcessPriority(pid, 'Normal').catch(() => {});
  }
}

async function startAutoBoost(options = {}, onEvent) {
  if (autoBoostTimer) return { running: true };

  // Adaptive polling: while nothing heavy is running there's nothing to
  // react to, so back off to a much slower cadence instead of waking up
  // every few seconds forever. A tool that claims to speed up the machine
  // shouldn't itself be a constant background cost. Snaps back to the fast
  // interval the moment a boost target appears.
  const activeIntervalMs = Math.max(options.intervalMs || 8000, 3000);
  const idleIntervalMs = activeIntervalMs * 4;
  let currentIntervalMs = activeIntervalMs;

  const reschedule = (nextIntervalMs) => {
    if (nextIntervalMs === currentIntervalMs || !autoBoostTimer) return;
    currentIntervalMs = nextIntervalMs;
    clearInterval(autoBoostTimer);
    autoBoostTimer = setInterval(tick, currentIntervalMs);
  };

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
        reschedule(activeIntervalMs);

        const lowering = planBackgroundLowering(procs, target, {
          customBackground: customBackgroundAppNames,
          customHeavy: customHeavyAppNames
        });
        for (const p of lowering) {
          try {
            await setProcessPriority(p.pid, 'BelowNormal');
            loweredByBoost.set(p.pid, p.name);
          } catch (_) {
            // Access denied (e.g. a program that guards itself) or it already
            // exited: nothing was changed, so there is nothing to remember.
          }
        }
      } else {
        if (autoBoostTarget) {
          await setProcessPriority(autoBoostTarget.pid, 'Normal').catch(() => {});
          autoBoostTarget = null;
        }
        await restoreLoweredApps(procs);
        const top = procs[0];
        if (onEvent) {
          onEvent({ type: 'idle', topName: top ? top.name : null, topCpu: top ? top.cpuPercent : 0 });
        }
        reschedule(idleIntervalMs);
      }
    } catch (err) {
      if (onEvent) onEvent({ type: 'error', message: err.message });
    }
  };

  autoBoostTimer = setInterval(tick, currentIntervalMs);
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
  await restoreLoweredApps();
  return { running: false };
}

module.exports = { listProcesses, setProcessPriority, killProcess, startAutoBoost, stopAutoBoost, setAutoBoostConfig, pickBoostTarget, stopProcessWorker, CRITICAL_NAMES, HEAVY_APP_NAMES };
