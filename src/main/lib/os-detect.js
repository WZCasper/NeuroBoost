'use strict';

const os = require('os');
const { runPowerShell } = require('./powershell-runner');

// Windows 11 kept the "10.0.x" kernel version, so the only reliable signal
// to tell it apart from Windows 10 is the build number: 22000 was the first
// public Windows 11 build.
const WIN11_MIN_BUILD = 22000;
// 22621 (22H2) is when Copilot's policy key started being honored.
const COPILOT_MIN_BUILD = 22621;

/**
 * `os.release()` on Windows returns "10.0.<build>" straight from the kernel
 * — no subprocess needed for the core Win10/Win11 + build decision.
 */
function parseBuildFromRelease() {
  const parts = os.release().split('.');
  return Number(parts[2]) || 0;
}

async function getSystemInfo() {
  if (process.platform !== 'win32') {
    return {
      platform: process.platform,
      supported: false,
      message: 'NeuroBoost поддерживает только Windows 10 и Windows 11.'
    };
  }

  const buildNumber = parseBuildFromRelease();
  const isWindows11 = buildNumber >= WIN11_MIN_BUILD;

  // Best-effort extra detail (UBR / DisplayVersion / edition name) read from
  // the registry. Non-fatal if it fails — the Win10/Win11 + build decision
  // above already stands on its own without it.
  let ubr = null;
  let displayVersion = null;
  let productName = null;
  try {
    const script =
      "$reg = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion' -ErrorAction Stop; " +
      '[pscustomobject]@{ ubr = [int]$reg.UBR; displayVersion = [string]$reg.DisplayVersion; ' +
      'productName = [string]$reg.ProductName } | ConvertTo-Json -Compress';
    const raw = await runPowerShell(script, { timeoutMs: 8000 });
    const parsed = JSON.parse(raw.trim());
    ubr = parsed.ubr;
    displayVersion = parsed.displayVersion;
    productName = parsed.productName;
  } catch (_) {
    // fall back silently to what os.release() already gave us
  }

  return {
    platform: 'win32',
    supported: true,
    osName: isWindows11 ? 'Windows 11' : 'Windows 10',
    isWindows11,
    buildNumber,
    ubr,
    fullBuild: ubr ? `${buildNumber}.${ubr}` : String(buildNumber),
    displayVersion: displayVersion || 'unknown',
    productName: productName || (isWindows11 ? 'Windows 11' : 'Windows 10'),
    architecture: process.arch,
    hostname: os.hostname(),
    cpuModel: (os.cpus() && os.cpus()[0] && os.cpus()[0].model) || 'unknown',
    totalMemoryGB: +(os.totalmem() / 1024 ** 3).toFixed(1),

    // Feature flags so the rest of the app (and the renderer) can adjust
    // which actions it offers instead of hardcoding a single Windows version.
    features: {
      cortanaRemovable: !isWindows11,
      widgetsToggle: isWindows11,
      copilotToggle: isWindows11 && buildNumber >= COPILOT_MIN_BUILD,
      startMenuIsWin11: isWindows11
    }
  };
}

module.exports = { getSystemInfo, WIN11_MIN_BUILD, COPILOT_MIN_BUILD };
