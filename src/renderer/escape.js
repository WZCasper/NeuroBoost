'use strict';

/**
 * HTML escaping for strings that are interpolated into innerHTML templates.
 *
 * The previous implementation (textContent -> innerHTML) only escapes
 * `&`, `<` and `>`. It does NOT escape quotes, so a value placed inside an
 * attribute (title="...", data-x="...") could close the attribute and inject
 * new ones. Startup entry names and commands are written by arbitrary
 * third-party software, so they must be treated as untrusted.
 *
 * Dual-mode file: a plain <script> in the renderer (exposes
 * window.NeuroBoostEscape) and a CommonJS module for `node --test`.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.NeuroBoostEscape = api;
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '`': '&#96;'
  };

  function escapeHtml(value) {
    if (value == null) return '';
    return String(value).replace(/[&<>"'`]/g, (ch) => MAP[ch]);
  }

  return { escapeHtml };
});
