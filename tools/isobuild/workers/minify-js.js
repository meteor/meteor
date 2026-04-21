'use strict';

// ---------------------------------------------------------------------------
// JS Minification Worker Handler
// ---------------------------------------------------------------------------
// Handles per-file JavaScript minification using SWC or Terser.
// Both are pure transformations: source string in, minified code out.

let swc = null;
let terser = null;

module.exports = {
  /**
   * Minify JavaScript source with SWC.
   * @param {object} payload
   * @param {string} payload.source - The JavaScript source code.
   * @param {object} payload.options - SWC minify options.
   * @returns {{ code: string, map?: string }}
   */
  'minify-js-swc'({ source, options }) {
    if (!swc) swc = require('@meteorjs/swc-core');
    return swc.minifySync(source, options);
  },

  /**
   * Minify JavaScript source with Terser.
   * @param {object} payload
   * @param {string} payload.source - The JavaScript source code.
   * @param {object} payload.options - Terser minify options.
   * @returns {Promise<{ code: string, map?: object }>}
   */
  async 'minify-js-terser'({ source, options }) {
    if (!terser) terser = require('terser');
    const result = await terser.minify(source, options);
    return {
      code: result.code,
      map: result.map
        ? (typeof result.map === 'string' ? JSON.parse(result.map) : result.map)
        : undefined,
    };
  },
};
