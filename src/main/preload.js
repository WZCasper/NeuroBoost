'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

function subscribe(channel, cb) {
  const listener = (_event, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

// Every call returns { ok: true, data } or { ok: false, error }. Nothing in
// this bridge exposes ipcRenderer, Node, or fs/child_process directly to the
// page — contextIsolation + sandbox stay on for the renderer.
contextBridge.exposeInMainWorld('neuroboost', {
  system: {
    getInfo: () => invoke('system:getInfo'),
    isElevated: () => invoke('system:isElevated')
  },
  debloat: {
    list: () => invoke('debloat:list'),
    remove: (ids) => invoke('debloat:remove', ids),
    onProgress: (cb) => subscribe('debloat:progress', cb)
  },
  telemetry: {
    status: () => invoke('telemetry:status'),
    disable: (options) => invoke('telemetry:disable', options),
    restore: () => invoke('telemetry:restore')
  },
  ram: {
    info: () => invoke('ram:info'),
    purge: () => invoke('ram:purge'),
    onProgress: (cb) => subscribe('ram:progress', cb)
  },
  process: {
    list: () => invoke('process:list'),
    setPriority: (pid, priority) => invoke('process:setPriority', pid, priority),
    kill: (pid, name) => invoke('process:kill', pid, name),
    autoBoostStart: (options) => invoke('process:autoBoostStart', options),
    autoBoostStop: () => invoke('process:autoBoostStop'),
    onAutoBoostEvent: (cb) => subscribe('process:autoBoostEvent', cb)
  },
  openExternal: (url) => invoke('app:openExternal', url)
});
