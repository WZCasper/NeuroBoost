'use strict';

const { exec } = require('child_process');

/**
 * `net session` fails with an access-denied error when the current process
 * is not running elevated, and succeeds silently when it is. It's the
 * standard, dependency-free way to detect admin rights on Windows without
 * calling into native code.
 */
function isElevatedWindows() {
  return new Promise((resolve) => {
    exec('net session', { windowsHide: true }, (error) => {
      resolve(!error);
    });
  });
}

module.exports = { isElevatedWindows };
