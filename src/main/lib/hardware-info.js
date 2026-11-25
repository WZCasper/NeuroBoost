'use strict';

const path = require('path');
const { runPowerShellFile } = require('./powershell-runner');
const { scriptsDir } = require('./paths');

/**
 * Static identity (motherboard, GPU model, RAM modules) plus live load for
 * CPU, GPU and RAM. No PSU section - see get-hardware-info.ps1 for why.
 * Temperatures are fetched separately (getHardwareTemps), since they need
 * an optional third-party component this call does not depend on.
 */
async function getHardwareInfo() {
  const scriptPath = path.join(scriptsDir(), 'get-hardware-info.ps1');
  const raw = await runPowerShellFile(scriptPath, [], 15000);
  return JSON.parse(raw.trim());
}

/**
 * Installs the PawnIO driver (silent, bundled installer) if it is not
 * already present. A real installer run, not just a registry check, so it
 * gets a longer timeout than the other calls here.
 */
async function ensurePawnIo() {
  const scriptPath = path.join(scriptsDir(), 'ensure-pawnio.ps1');
  const raw = await runPowerShellFile(scriptPath, [], 60000);
  return JSON.parse(raw.trim());
}

/**
 * CPU/GPU/motherboard temperatures via LibreHardwareMonitorLib. Always
 * returns a well-formed object (available: false with a reason, never a
 * thrown error) when PawnIO is missing or reading sensors otherwise fails.
 */
async function getHardwareTemps() {
  const scriptPath = path.join(scriptsDir(), 'get-hardware-temps.ps1');
  const raw = await runPowerShellFile(scriptPath, [], 15000);
  return JSON.parse(raw.trim());
}

module.exports = { getHardwareInfo, ensurePawnIo, getHardwareTemps };
