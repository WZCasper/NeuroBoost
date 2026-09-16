'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB, then rotate

function logDir() {
  const dir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function logFilePath() {
  return path.join(logDir(), 'neuroboost.log');
}

function rotateIfNeeded() {
  try {
    const p = logFilePath();
    if (fs.existsSync(p) && fs.statSync(p).size > MAX_LOG_BYTES) {
      const oldPath = path.join(logDir(), 'neuroboost.old.log');
      fs.rmSync(oldPath, { force: true });
      fs.renameSync(p, oldPath);
    }
  } catch (_) {
    /* logging must never crash the app */
  }
}

function write(level, message) {
  try {
    rotateIfNeeded();
    const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
    fs.appendFileSync(logFilePath(), line, 'utf8');
    if (!app.isPackaged) {
      // eslint-disable-next-line no-console
      console.log(line.trim());
    }
  } catch (_) {
    /* logging must never crash the app */
  }
}

const log = {
  info: (message) => write('INFO', message),
  warn: (message) => write('WARN', message),
  error: (message) => write('ERROR', message)
};

module.exports = { log, logFilePath };
