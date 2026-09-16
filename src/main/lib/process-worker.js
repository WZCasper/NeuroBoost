'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { scriptsDir } = require('./paths');

let child = null;
let stdoutBuffer = '';
const pending = new Map(); // id -> { resolve, reject, timer }
let nextId = 1;

function ensureWorker() {
  if (child && !child.killed) return child;

  const scriptPath = path.join(scriptsDir(), 'list-processes-worker.ps1');
  child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', scriptPath],
    { windowsHide: true }
  );
  stdoutBuffer = '';

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString('utf8');
    let idx;
    while ((idx = stdoutBuffer.indexOf('\n')) >= 0) {
      const line = stdoutBuffer.slice(0, idx).trim();
      stdoutBuffer = stdoutBuffer.slice(idx + 1);
      if (!line) continue;
      let resp;
      try {
        resp = JSON.parse(line);
      } catch (_) {
        continue; // ignore stray non-JSON output
      }
      const entry = pending.get(resp.id);
      if (!entry) continue;
      clearTimeout(entry.timer);
      pending.delete(resp.id);
      if (resp.ok) entry.resolve(resp.data);
      else entry.reject(new Error(resp.error || 'Worker returned an error'));
    }
  });

  const cleanup = (reason) => {
    for (const [, entry] of pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error(reason));
    }
    pending.clear();
    child = null;
  };

  child.on('exit', () => cleanup('PowerShell worker process exited unexpectedly'));
  child.on('error', (err) => cleanup('PowerShell worker process error: ' + err.message));

  return child;
}

function sendCommand(cmd, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = ensureWorker();
    } catch (err) {
      reject(err);
      return;
    }

    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('PowerShell worker timed out'));
    }, timeoutMs);
    pending.set(id, { resolve, reject, timer });

    try {
      proc.stdin.write(JSON.stringify({ ...cmd, id }) + '\n');
    } catch (err) {
      clearTimeout(timer);
      pending.delete(id);
      reject(err);
    }
  });
}

async function listProcessesViaWorker() {
  return sendCommand({ cmd: 'list' });
}

function stopWorker() {
  if (child && !child.killed) {
    try {
      child.stdin.end();
    } catch (_) {
      /* ignore */
    }
    try {
      child.kill();
    } catch (_) {
      /* ignore */
    }
  }
  child = null;
}

module.exports = { listProcessesViaWorker, stopWorker };
