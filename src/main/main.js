'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, Notification } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { log, logFilePath } = require('./lib/logger');

const isDev = !app.isPackaged;

// ---------------------------------------------------------------------------
// Single instance lock - a system-modifying tool must never run twice.
// ---------------------------------------------------------------------------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let mainWindow = null;
let tray = null;
let isQuitting = false;
let autoBoostRunningForTray = false;

function trayIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'tray-icon.png')
    : path.join(__dirname, '..', '..', 'resources', 'tray-icon.png');
}

function createWindow(startHidden) {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#070b14',
    autoHideMenuBar: true,
    title: 'NeuroBoost',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (!startHidden) mainWindow.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Minimize to tray instead of quitting on the X button - the whole point
  // of Auto-Boost and the tray is that NeuroBoost keeps working in the
  // background. A real quit only happens via the tray menu's "Выход".
  mainWindow.on('close', (event) => {
    const { getSettings } = require('./lib/settings');
    if (!isQuitting && getSettings().minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (!mainWindow) {
    createWindow(false);
    return;
  }
  mainWindow.show();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function updateTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: 'Открыть NeuroBoost', click: showMainWindow },
    { type: 'separator' },
    {
      label: autoBoostRunningForTray ? 'Авто-ускорение: включено' : 'Авто-ускорение: выключено',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Выход',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  try {
    tray = new Tray(trayIconPath());
    tray.setToolTip('NeuroBoost');
    tray.on('click', showMainWindow);
    updateTrayMenu();
  } catch (err) {
    // Non-fatal - the app is fully usable without a tray icon.
    console.error('Tray creation failed:', err.message);
  }
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
      title: 'NeuroBoost - требуются права администратора',
      message: 'NeuroBoost требуются права администратора для чтения и изменения системных настроек.',
      detail:
        'Большинство действий не будут работать без них. Закройте это окно, откройте ' +
        'терминал от имени администратора и снова выполните "npm start".',
      buttons: ['Всё равно продолжить']
    });
  }
  return elevated;
}

app.whenReady().then(async () => {
  await verifyElevationOrWarn();
  registerIpcHandlers();
  createTray();
  log.info('App starting, version ' + app.getVersion());

  const { getSettings } = require('./lib/settings');
  const settings = getSettings();

  // Autostart is handled by a scheduled task (see lib/autostart.js), not
  // setLoginItemSettings: Windows will not auto-start an app that requires
  // elevation from a Run key, which is exactly what NeuroBoost does.
  // The task passes --start-minimized so a logon launch goes to the tray.
  const wasAutoLaunched = process.argv.includes('--start-minimized');
  createWindow(wasAutoLaunched);

  if (settings.autoBoostEnabledOnLaunch) {
    const { startAutoBoost, setAutoBoostConfig } = require('./lib/process-manager');
    setAutoBoostConfig({ cpuThreshold: settings.autoBoostCpuThreshold, customHeavyApps: settings.customHeavyApps });
    startAutoBoost({ intervalMs: 8000 }, (event) => handleAutoBoostEvent(event));
    autoBoostRunningForTray = true;
    updateTrayMenu();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(false);
    else showMainWindow();
  });

  if (app.isPackaged) {
    autoUpdater.logger = { info: log.info, warn: log.warn, error: log.error, debug: () => {} };
    autoUpdater.checkForUpdatesAndNotify().catch((err) => log.warn('Update check failed: ' + err.message));
  }
});

app.on('window-all-closed', () => {
  // If we get here at all, the window really did close - either
  // minimizeToTray is off, or this was a genuine quit via the tray menu
  // (the `close` handler above is what decides whether closing the window
  // hides it instead; reaching this event means that didn't happen).
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  log.info('App quitting');
  try {
    const { stopAutoBoost, stopProcessWorker } = require('./lib/process-manager');
    stopAutoBoost();
    stopProcessWorker();
  } catch (_) {
    /* ignore */
  }
});

function handleAutoBoostEvent(event) {
  if (mainWindow) mainWindow.webContents.send('process:autoBoostEvent', event);
  if (event.type === 'boosted' && Notification.isSupported()) {
    new Notification({
      title: 'NeuroBoost \u2014 авто-ускорение',
      body: event.name + '.exe получил приоритет "Высокий" (' + event.cpuPercent.toFixed(0) + '% ЦП)',
      silent: true
    }).show();
  }
}

// ---------------------------------------------------------------------------
// IPC - every handler is wrapped so renderer calls always resolve with a
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
    killProcess,
    startAutoBoost,
    stopAutoBoost,
    setAutoBoostConfig
  } = require('./lib/process-manager');
  const { listStartupItems, toggleStartupItem } = require('./lib/startup-manager');
  const { scanDiskCategories, cleanDiskCategories } = require('./lib/disk-cleaner');
  const { createRestorePoint } = require('./lib/restore-point');
  const { getSettings, updateSettings } = require('./lib/settings');
  const { getAutostartStatus, setAutostart } = require('./lib/autostart');

  const safe = (channel, handler) => {
    ipcMain.handle(channel, async (_event, ...args) => {
      try {
        const data = await handler(...args);
        return { ok: true, data };
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        log.error(`[${channel}] ${message}`);
        return { ok: false, error: message };
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
  safe('debloat:remove', async (ids) => {
    const rp = await createRestorePoint('NeuroBoost - before removing apps');
    const results = await removeApps(ids, (progress) => {
      if (mainWindow) mainWindow.webContents.send('debloat:progress', progress);
    });
    return { results, restorePoint: rp };
  });

  safe('telemetry:status', () => getTelemetryStatus());
  safe('telemetry:disable', async (options) => {
    const rp = await createRestorePoint('NeuroBoost - before telemetry changes');
    const result = await disableTelemetry(options);
    return { ...result, restorePoint: rp };
  });
  safe('telemetry:restore', () => restoreTelemetry());

  safe('ram:info', () => getMemoryInfo());
  safe('ram:purge', () =>
    purgeStandbyList((event) => {
      if (mainWindow) mainWindow.webContents.send('ram:progress', event);
    })
  );

  safe('process:list', () => listProcesses());
  safe('process:setPriority', (pid, priority) => setProcessPriority(pid, priority));
  safe('process:kill', (pid, name) => killProcess(pid, name));
  safe('process:autoBoostStart', (options) => {
    const settings = getSettings();
    setAutoBoostConfig({ cpuThreshold: settings.autoBoostCpuThreshold, customHeavyApps: settings.customHeavyApps });
    const result = startAutoBoost(options, handleAutoBoostEvent);
    autoBoostRunningForTray = true;
    updateTrayMenu();
    updateSettings({ autoBoostEnabledOnLaunch: true });
    return result;
  });
  safe('process:autoBoostStop', () => {
    const result = stopAutoBoost();
    autoBoostRunningForTray = false;
    updateTrayMenu();
    updateSettings({ autoBoostEnabledOnLaunch: false });
    return result;
  });

  safe('startup:list', () => listStartupItems());
  safe('startup:toggle', (id, enabled) => toggleStartupItem(id, enabled));

  safe('disk:scan', () => scanDiskCategories());
  safe('disk:clean', (categoryIds) =>
    cleanDiskCategories(categoryIds, (event) => {
      if (mainWindow) mainWindow.webContents.send('disk:progress', event);
    })
  );

  safe('restorePoint:create', (description) => createRestorePoint(description));

  safe('settings:get', () => getSettings());
  safe('settings:update', async (partial) => {
    // Autostart must be applied through the scheduled task and then
    // re-read, so a failure surfaces to the user instead of the UI showing
    // a toggle that silently did nothing.
    if (process.platform === 'win32' && typeof partial.startWithWindows === 'boolean') {
      await setAutostart(partial.startWithWindows);
      partial = { ...partial, startWithWindows: await getAutostartStatus() };
    }
    const next = updateSettings(partial);
    if (partial.autoBoostCpuThreshold || partial.customHeavyApps) {
      setAutoBoostConfig({ cpuThreshold: next.autoBoostCpuThreshold, customHeavyApps: next.customHeavyApps });
    }
    return next;
  });

  safe('settings:autostartStatus', () => getAutostartStatus());

  ipcMain.handle('app:openExternal', (_event, url) => shell.openExternal(url));
  ipcMain.handle('app:getVersion', () => app.getVersion());
  ipcMain.handle('logs:reveal', () => {
    shell.showItemInFolder(logFilePath());
    return true;
  });
}
