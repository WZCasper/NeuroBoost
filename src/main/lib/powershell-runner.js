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
 * @param {(line: string) => void} [options.onLine]
 *        Called once per stdout line as it arrives, for real-time progress
 *        (a script emits one JSON object per line). The full stdout is
 *        still buffered and returned on resolve either way.
 * @returns {Promise<string>}            stdout on success (exit code 0).
 */
function runPowerShell(scriptOrPath, options = {}) {
  const { args = [], timeoutMs = DEFAULT_TIMEOUT_MS, asFile = false, onLine } = options;

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
    let lineBuffer = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`PowerShell timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      const text = d.toString('utf8');
      stdout += text;
      if (onLine) {
        lineBuffer += text;
        let idx;
        while ((idx = lineBuffer.indexOf('\n')) >= 0) {
          const line = lineBuffer.slice(0, idx).trim();
          lineBuffer = lineBuffer.slice(idx + 1);
          if (line) onLine(line);
        }
      }
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
      if (onLine && lineBuffer.trim()) {
        onLine(lineBuffer.trim());
      }
      if (code !== 0) {
        reject(new Error(`PowerShell exited with code ${code}: ${(stderr || stdout).trim()}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function runPowerShellFile(scriptPath, args = [], timeoutMs, onLine) {
  return runPowerShell(scriptPath, { args, timeoutMs, asFile: true, onLine });
}

module.exports = { runPowerShell, runPowerShellFile };
