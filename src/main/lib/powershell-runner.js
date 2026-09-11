'use strict';

const { spawn } = require('child_process');

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Runs a PowerShell command or script file via spawn (never a shell string),
 * so arguments are passed as real argv entries and never re-interpreted by
 * cmd.exe. This is the only place in the codebase that shells out.
 *
 * @param {string} scriptOrPath  Inline -Command text, or a .ps1 file path
 *                               when options.asFile is true.
 * @param {object} [options]
 * @param {string[]} [options.args]      Extra args appended (only used with asFile).
 * @param {number} [options.timeoutMs]   Kill + reject after this many ms.
 * @param {boolean} [options.asFile]     Run as `-File <path> <args...>`.
 * @returns {Promise<string>}            stdout on success (exit code 0).
 */
function runPowerShell(scriptOrPath, options = {}) {
  const { args = [], timeoutMs = DEFAULT_TIMEOUT_MS, asFile = false } = options;

  return new Promise((resolve, reject) => {
    const psArgs = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden'];

    if (asFile) {
      psArgs.push('-File', scriptOrPath, ...args);
    } else {
      psArgs.push('-Command', scriptOrPath);
    }

    const child = spawn('powershell.exe', psArgs, { windowsHide: true });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`PowerShell timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d.toString('utf8');
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString('utf8');
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`PowerShell exited with code ${code}: ${(stderr || stdout).trim()}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function runPowerShellFile(scriptPath, args = [], timeoutMs) {
  return runPowerShell(scriptPath, { args, timeoutMs, asFile: true });
}

module.exports = { runPowerShell, runPowerShellFile };
