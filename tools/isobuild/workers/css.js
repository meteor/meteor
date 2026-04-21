'use strict';

// ---------------------------------------------------------------------------
// CSS Worker Handler
// ---------------------------------------------------------------------------
// Handles CSS parsing and minification in worker threads.
// These are I/O-free, CPU-bound operations ideal for parallelization.

let postcss = null;
let cssnano = null;

module.exports = {
  /**
   * Parse a CSS file into an AST using PostCSS.
   * Used to parallelize the parsing phase of CSS merging.
   *
   * @param {object} payload
   * @param {string} payload.source - The CSS source code.
   * @param {string} [payload.from] - The source file path (for source maps).
   * @returns {{ css: string, map?: object }} Serialized PostCSS result.
   */
  'css-parse'({ source, from }) {
    if (!postcss) postcss = require('postcss');

    const result = postcss([]).process(source, {
      from: from || 'input.css',
    });

    return {
      css: result.css,
      map: result.map ? result.map.toJSON() : undefined,
    };
  },

  /**
   * Minify a CSS string using cssnano (via PostCSS).
   * Typically called once on the merged CSS output.
   *
   * @param {object} payload
   * @param {string} payload.source - The CSS source code to minify.
   * @returns {Promise<{ css: string }>}
   */
  async 'css-minify'({ source }) {
    if (!postcss) postcss = require('postcss');
    if (!cssnano) {
      try {
        cssnano = require('cssnano');
      } catch (_) {
        // cssnano may not be available; return source unchanged.
        return { css: source };
      }
    }

    const result = await postcss([cssnano({ safe: true })]).process(source, {
      from: undefined,
    });

    return { css: result.css };
  },
};
