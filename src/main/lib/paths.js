'use strict';

const path = require('path');
const { app } = require('electron');

/**
 * Scripts live outside the asar archive (see build.extraResources in
 * package.json) because Windows can't execute a .ps1 file that lives inside
 * an archive. In dev, they're read straight from /resources/scripts.
 */
function scriptsDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'scripts')
    : path.join(__dirname, '..', '..', '..', 'resources', 'scripts');
}

module.exports = { scriptsDir };
