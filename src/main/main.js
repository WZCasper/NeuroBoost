'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');

const isDev = !app.isPackaged;

// ---------------------------------------------------------------------------
// Single instance lock — a system-modifying tool must never run twice.
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#0c1016',
    autoHideMenuBar: true,
    title: 'NeuroBoost',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Admin elevation.
//
// The *packaged* installer already embeds a `requireAdministrator` manifest
// (see build.win.requestedExecutionLevel in package.json), so Windows shows
// the UAC prompt before a single line of app code runs. This check only
// matters when running unpackaged in development via `npm start`, where no
// manifest exists yet.
// ---------------------------------------------------------------------------
async function verifyElevationOrWarn() {
  if (process.platform !== 'win32' || app.isPackaged) return true;

  const { isElevatedWindows } = require('./lib/elevation');
  const elevated = await isElevatedWindows();
  if (!elevated) {
    await dialog.showMessageBox({
      type: 'warning',
      title: 'NeuroBoost — Administrator rights required',
      message: 'NeuroBoost needs Administrator rights to read and change system settings.',
      detail:
        'Most actions will fail without them. Close this window, reopen your ' +
        'terminal with "Run as administrator", and run "npm start" again.',
      buttons: ['Continue anyway']
    });
  }
  return elevated;
}

app.whenReady().then(async () => {
  await verifyElevationOrWarn();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  try {
    // Best-effort: stop any running auto-boost loop and restore priorities.
    const { stopAutoBoost } = require('./lib/process-manager');
    stopAutoBoost();
  } catch (_) {
    /* ignore */
  }
});

// ---------------------------------------------------------------------------
// IPC — every handler is wrapped so renderer calls always resolve with a
// { ok, data } or { ok:false, error } shape instead of throwing across the
// process boundary.
// ---------------------------------------------------------------------------
function registerIpcHandlers() {
  const { getSystemInfo } = require('./lib/os-detect');
  const { listRemovableApps, removeApps } = require('./lib/debloater');
  const { getTelemetryStatus, disableTelemetry, restoreTelemetry } = require('./lib/telemetry');
  const { purgeStandbyList, getMemoryInfo } = require('./lib/ram-cleaner');
  const {
    listProcesses,
    setProcessPriority,
    startAutoBoost,
    stopAutoBoost
  } = require('./lib/process-manager');

  const safe = (channel, handler) => {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        const data = await handler(...args);
        return { ok: true, data };
      } catch (err) {
        return { ok: false, error: err && err.message ? err.message : String(err) };
      }
    });
  };

  safe('system:getInfo', () => getSystemInfo());
  safe('system:isElevated', async () => {
    if (process.platform !== 'win32') return false;
    const { isElevatedWindows } = require('./lib/elevation');
    return isElevatedWindows();
  });

  safe('debloat:list', () => listRemovableApps());
  safe('debloat:remove', (ids) =>
    removeApps(ids, (progress) => {
      if (mainWindow) mainWindow.webContents.send('debloat:progress', progress);
    })
  );

  safe('telemetry:status', () => getTelemetryStatus());
  safe('telemetry:disable', (options) => disableTelemetry(options));
  safe('telemetry:restore', () => restoreTelemetry());

  safe('ram:info', () => getMemoryInfo());
  safe('ram:purge', () => purgeStandbyList());

  safe('process:list', () => listProcesses());
  safe('process:setPriority', (pid, priority) => setProcessPriority(pid, priority));
  safe('process:autoBoostStart', (options) =>
    startAutoBoost(options, (event) => {
      if (mainWindow) mainWindow.webContents.send('process:autoBoostEvent', event);
    })
  );
  safe('process:autoBoostStop', () => stopAutoBoost());

  ipcMain.handle('app:openExternal', (_event, url) => shell.openExternal(url));
}
