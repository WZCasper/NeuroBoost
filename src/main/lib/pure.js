'use strict';

/**
 * Pure, Electron-independent logic extracted out of settings.js and
 * telemetry.js specifically so it can be unit-tested with plain
 * `node --test` (requiring those files directly would fail outside an
 * Electron process, since they load the `electron` module at the top for
 * app.getPath).
 */

function mergeSettings(base, partial) {
  return {
    ...base,
    ...partial,
    telemetryOptions: { ...base.telemetryOptions, ...(partial.telemetryOptions || {}) }
  };
}

function mergeTelemetryBackup(existing, newBackup) {
  const existingKeys = new Set(existing.map((e) => e.path + '|' + e.name));
  const newOnly = newBackup.filter((e) => !existingKeys.has(e.path + '|' + e.name));
  return existing.concat(newOnly);
}

// --- Auto-Boost target selection -----------------------------------------
// Lives here (rather than in process-manager.js) so it can be unit-tested
// without pulling in Electron: process-manager requires paths.js, which
// requires the electron module and therefore can't load under plain Node.

const CRITICAL_NAMES = new Set([
  'system', 'idle', 'registry', 'csrss', 'wininit', 'winlogon', 'services',
  'lsass', 'smss', 'secure system', 'memory compression', 'svchost', 'dwm',
  'explorer', 'securityhealthservice', 'msmpeng', 'nissrv', 'neuroboost'
]);

const HEAVY_APP_NAMES = new Set([
  'obs64', 'obs32', 'obs', 'cs2', 'csgo', 'valorant-win64-shipping', 'r5apex',
  'fortniteclient-win64-shipping', 'gta5', 'eldenring', 'cyberpunk2077',
  'starfield', 'blender', 'afterfx', 'resolve', 'unrealeditor', 'unity'
]);

const DEPRIORITIZE_NAMES = new Set([
  'onedrive', 'searchindexer', 'widgets', 'yourphone', 'msteams', 'ms-teams', 'teams', 'skype',
  'spotify', 'chrome', 'msedge'
]);

/**
 * Chooses which process Auto-Boost should raise to High, if any.
 * A known heavy app (or a user-configured one) always wins; otherwise the
 * highest-CPU non-critical process above the threshold is used.
 */
function pickBoostTarget(procs, { cpuThreshold = 25, customHeavyApps = new Set() } = {}) {
  const custom = customHeavyApps instanceof Set ? customHeavyApps : new Set(customHeavyApps || []);
  const heavy = procs.find((p) => {
    const n = p.name.toLowerCase();
    return HEAVY_APP_NAMES.has(n) || custom.has(n);
  });
  if (heavy) return heavy;
  return procs.find((p) => p.cpuPercent >= cpuThreshold && !CRITICAL_NAMES.has(p.name.toLowerCase()));
}

// --- External URL allowlist -----------------------------------------------
// Only these exact locations may ever be handed to the user's default
// browser. Kept here (Electron-free) so the rule itself is unit-tested.
//
// github.com/WZCasper/NeuroBoost is the project repository. t.me/WZ_Casper
// and dalink.to/wz_casper are the developer's own contact and donation
// links, shown only in the small "developer" credit in the UI - not
// something a script or a third-party page could ever feed to
// app:openExternal on its own, since the IPC caller passes no arguments
// the renderer controls for this call.
const EXTERNAL_URL_ALLOWLIST = [
  'https://github.com/WZCasper/NeuroBoost',
  'https://t.me/WZ_Casper',
  'https://dalink.to/wz_casper'
];

function isAllowedExternalUrl(url) {
  if (typeof url !== 'string') return false;
  let parsed;
  try {
    parsed = new URL(url);
  } catch (_) {
    return false;
  }
  if (parsed.protocol !== 'https:') return false;
  // Reject credentials in the URL ("https://github.com@evil.example/..."
  // style tricks) and any non-default port outright.
  if (parsed.username || parsed.password || parsed.port) return false;

  return EXTERNAL_URL_ALLOWLIST.some((allowed) => {
    const allowedUrl = new URL(allowed);
    if (parsed.hostname !== allowedUrl.hostname) return false;
    // Compare on the normalized pathname so "/WZCasper/NeuroBoost/../../evil"
    // cannot escape the allowed prefix after URL resolution.
    const base = allowedUrl.pathname;
    return parsed.pathname === base || parsed.pathname.startsWith(base + '/');
  });
}

// --- Background apps lowered while a game / heavy app runs ----------------
// Names as a person types them ("Chrome.exe ", "OneDrive") versus as
// PowerShell reports them (ProcessName: lower-cased here, no extension).
// One normalisation shared by both user-editable lists, so a stray ".exe"
// can never make an entry silently fail to match.
function normalizeProcessName(name) {
  return String(name == null ? '' : name).trim().toLowerCase().replace(/\.exe$/, '');
}

// Accepts anything (settings.json is hand-editable): a non-array, or
// non-string entries, simply yield an empty / filtered set.
function toNameSet(list) {
  const items = list instanceof Set ? [...list] : Array.isArray(list) ? list : [];
  return new Set(items.map(normalizeProcessName).filter(Boolean));
}

// Precedence, strongest first:
//  1. CRITICAL (system, shell, Windows Defender, NeuroBoost itself) is never
//     touched - even if a person types its name into their own list.
//  2. A program that is itself a boost target (known or custom heavy app) is
//     never also "background".
//  3. Only then: the built-in conservative list plus the person's own.
// customBackground / customHeavy must be Sets of already-normalised names.
function isBackgroundApp(name, { customBackground = new Set(), customHeavy = new Set() } = {}) {
  const n = normalizeProcessName(name);
  if (!n || CRITICAL_NAMES.has(n)) return false;
  if (HEAVY_APP_NAMES.has(n) || customHeavy.has(n)) return false;
  return DEPRIORITIZE_NAMES.has(n) || customBackground.has(n);
}

// Which processes to lower right now. Only ones still on Normal: a priority
// a person already set by hand is left alone.
function planBackgroundLowering(procs, target, opts) {
  return procs
    .filter((p) => p.pid !== target.pid && p.priority === 'Normal' && isBackgroundApp(p.name, opts))
    .map((p) => ({ pid: p.pid, name: normalizeProcessName(p.name) }));
}

// Which of the previously lowered processes to put back. `lowered` is a
// Map(pid -> normalised name). A pid is restored only if it still belongs
// to the same program (Windows reuses pids) and is STILL on BelowNormal (a
// person may have changed it themselves meanwhile).
function planPriorityRestore(lowered, procs) {
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const restore = [];
  for (const [pid, name] of lowered) {
    const p = byPid.get(pid);
    if (p && normalizeProcessName(p.name) === name && p.priority === 'BelowNormal') restore.push(pid);
  }
  return restore;
}

module.exports = { normalizeProcessName, toNameSet, isBackgroundApp, planBackgroundLowering, planPriorityRestore, isAllowedExternalUrl, EXTERNAL_URL_ALLOWLIST, mergeSettings, mergeTelemetryBackup, pickBoostTarget, CRITICAL_NAMES, HEAVY_APP_NAMES, DEPRIORITIZE_NAMES };
