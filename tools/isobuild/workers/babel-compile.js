'use strict';

// ---------------------------------------------------------------------------
// Babel/SWC Compilation Worker Handler
// ---------------------------------------------------------------------------
// Handles per-file JavaScript transpilation using SWC or Babel.
// Both are pure transformations: source + options in, compiled code out.

let SWC = null;
let reifyCompile = null;
let reifyAcornParse = null;
let Babel = null;

function ensureSwc() {
  if (!SWC) {
    SWC = require('@meteorjs/swc-core');
    reifyCompile = require('@meteorjs/reify/lib/compiler').compile;
    reifyAcornParse = require('@meteorjs/reify/lib/parsers/acorn').parse;
  }
}

function ensureBabel() {
  if (!Babel) {
    // @meteorjs/babel provides the compile function.
    Babel = require('@meteorjs/babel');
  }
}

module.exports = {
  /**
   * Compile JavaScript source with SWC + Reify.
   *
   * @param {object} payload
   * @param {string} payload.source - The source code.
   * @param {object} payload.swcOptions - Options for SWC.transformSync.
   * @param {object} payload.reifyOptions - Options for reifyCompile.
   * @returns {{ code: string, map: object, sourceType: string }}
   */
  'babel-compile-swc'({ source, swcOptions, reifyOptions }) {
    ensureSwc();

    const transformed = SWC.transformSync(source, swcOptions);
    let content = transformed.code;

    const result = reifyCompile(content, {
      parse: reifyAcornParse,
      generateLetDeclarations: false,
      ast: false,
      avoidModernSyntax: true,
      enforceStrictMode: false,
      dynamicImport: true,
      ...reifyOptions,
    });
    content = result.code;

    return {
      code: content,
      map: typeof transformed.map === 'string'
        ? JSON.parse(transformed.map)
        : transformed.map,
      sourceType: 'module',
    };
  },

  /**
   * Compile JavaScript source with Babel.
   *
   * @param {object} payload
   * @param {string} payload.source - The source code.
   * @param {object} payload.babelOptions - Options for Babel.compile.
   * @param {object} [payload.cacheOptions] - Babel cache options.
   * @returns {{ code: string, map?: object, ast?: object }}
   */
  'babel-compile-babel'({ source, babelOptions, cacheOptions }) {
    ensureBabel();
    return Babel.compile(source, babelOptions, cacheOptions);
  },
};
