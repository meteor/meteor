const path = require("path");
const { prepareMeteorRspackConfig } = require("./meteorRspackConfigFactory");
const { builtinModules } = require("module");

/**
 * Resolve a package directory from node resolution.
 * @param {string} pkg
 * @returns {string} absolute directory of the package
 */
function pkgDir(pkg) {
  const resolved = require.resolve(`${pkg}/package.json`, {
    paths: [process.cwd()],
  });
  return path.dirname(resolved);
}

/**
 * Wrap externals for Meteor runtime (marks deps as externals).
 * Usage: compileWithMeteor(["sharp", "vimeo", "fs"])
 *
 * @param {string[]} deps - package names or module IDs
 * @returns {Record<string, object>} `{ meteorRspackConfigX: { externals: [...] } }`
 */
function compileWithMeteor(deps) {
  const flat = deps.flat().filter(Boolean);
  return prepareMeteorRspackConfig({
    externals: flat,
  });
}

/**
 * Add SWC transpilation rules limited to specific deps (monorepo-friendly).
 * Usage: compileWithRspack(["@org/lib-a", "zod"])
 *
 * Requires global `Meteor.swcConfigOptions` (as in your setup).
 *
 * @param {string[]} deps - package names to include in SWC loader
 * @returns {Record<string, object>} `{ meteorRspackConfigX: { module: { rules: [...] } } }`
 */
function compileWithRspack(deps, { options = {} } = {}) {
  const includeDirs = deps.flat().filter(Boolean).map(pkgDir);

  return prepareMeteorRspackConfig({
    module: {
      rules: [
        {
          test: /\.(?:[mc]?js|jsx|[mc]?ts|tsx)$/i,
          include: includeDirs,
          loader: "builtin:swc-loader",
          options,
        },
      ],
    },
  });
}

/**
 * Enable or disable Rspack cache config
 * Usage: setCache(false)
 *
 * @param {boolean} enabled
 * @param {Record<string, object>} cacheConfig
 * @returns {Record<string, object>} `{ meteorRspackConfigX: { cache: {} } }`
 */
function setCache(
  enabled,
  cacheConfig = { cache: true, experiments: { cache: true } },
) {
  return prepareMeteorRspackConfig(
    enabled
      ? cacheConfig
      : {
        cache: false, // disable cache
        experiments: {
          cache: false, // disable persistent cache (experimental flag)
        },
      },
  );
}

/**
 * Build an alias map that disables ALL Node core modules in a web build.
 * - Includes both 'fs' and 'node:fs' keys
 * - Optional extras let you block non-core modules too
 */
function makeWebNodeBuiltinsAlias(extras = []) {
  // Strip potential 'node:' prefixes then add both forms
  const core = new Set(builtinModules.map((m) => m.replace(/^node:/, "")));

  const names = new Set();
  for (const m of core) {
    names.add(m);           // e.g. 'fs'
    names.add(`node:${m}`); // e.g. 'node:fs'
  }
  for (const x of extras) names.add(x);

  // Map every name to false (causes hard error if imported)
  return Object.fromEntries([...names].map((m) => [m, false]));
}

module.exports = {
  compileWithMeteor,
  compileWithRspack,
  setCache,
  makeWebNodeBuiltinsAlias,
};
