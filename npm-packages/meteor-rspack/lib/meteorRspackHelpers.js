const path = require("path");
const { prepareMeteorRspackConfig } = require("./meteorRspackConfigFactory");
const { builtinModules } = require("module");

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
  const includeDirs = deps.flat().filter(Boolean)
      .map(pkg => typeof pkg === 'string' && !pkg.includes('node_modules')
          ? path.join(process.cwd(), 'node_modules', pkg)
          : pkg
      );

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
  cacheConfig = { cache: true, experiments: { cache: true } }
) {
  return prepareMeteorRspackConfig(
    enabled
      ? cacheConfig
      : {
          cache: false, // disable cache
          experiments: {
            cache: false, // disable persistent cache (experimental flag)
          },
        }
  );
}

/**
 * Build an alias map that disables ALL Node core modules in a web build.
 * - Includes both 'fs' and 'node:fs' keys
 * - Optional extras let you block non-core modules too
 */
function makeWebNodeBuiltinsAlias(extras = []) {
  // Node core list, normalized (strip `node:` prefix)
  const core = new Set(builtinModules.map((m) => m.replace(/^node:/, "")));

  // browser-safe allowlist (these we *don't* mark as false)
  const allowlist = new Set([
    "process",
    "util",
    "events",
    "path",
    "stream",
    "assert",
    "assert/strict",
  ]);

  const names = new Set();
  for (const m of core) {
    // Add both 'fs' and 'node:fs' variants
    names.add(m);
    names.add(`node:${m}`);
  }
  for (const x of extras) names.add(x);

  // ❌ Everything except the allowlist gets mapped to false
  const entries = [...names]
    .filter((m) => !allowlist.has(m.replace(/^node:/, "")))
    .map((m) => [m, false]);

  return Object.fromEntries(entries);
}

/**
 * Enable Rspack split vendor chunk config
 * Usage: splitVendorChunk()
 *
 * @returns {Record<string, object>} `{ meteorRspackConfigX: { optimization: { ... } } }`
 */
function splitVendorChunk() {
  return prepareMeteorRspackConfig({
    optimization: {
      splitChunks: {
        chunks: "all", // split both sync and async imports
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: "vendor",
            enforce: true,
            priority: 10,
            chunks: "all",
          },
        },
      },
    },
  });
}

/**
 * Extend SWC loader config by smart-merging custom options on top of Meteor's
 * defaults (via `mergeSplitOverlap`).  Only the properties you specify are
 * overridden; everything else is preserved.
 *
 * Usage: Meteor.extendSwcConfig({ jsc: { parser: { decorators: true } } })
 *
 * @param {object} swcConfig - SWC loader options to merge with defaults
 * @returns {Record<string, object>} config fragment for spreading into rspack config
 */
function extendSwcConfig(swcConfig) {
  return prepareMeteorRspackConfig({
    module: {
      rules: [
        {
          test: /\.(?:[mc]?js|jsx|[mc]?ts|tsx)$/i,
          exclude: /node_modules|\.meteor\/local/,
          loader: 'builtin:swc-loader',
          options: swcConfig,
        },
      ],
    },
  });
}

/**
 * Replace the SWC loader config entirely, discarding Meteor's defaults.
 * Use this when you need full control over SWC options and don't want any
 * automatic merging with Meteor's built-in configuration.
 *
 * Usage: Meteor.replaceSwcConfig({ jsc: { parser: { syntax: 'typescript' }, target: 'es2020' } })
 *
 * @param {object} swcConfig - Complete SWC loader options (replaces defaults)
 * @returns {Record<string, object>} config fragment for spreading into rspack config
 */
function replaceSwcConfig(swcConfig) {
  return prepareMeteorRspackConfig({
    module: {
      rules: [
        {
          test: /\.(?:[mc]?js|jsx|[mc]?ts|tsx)$/i,
          exclude: /node_modules|\.meteor\/local/,
          loader: 'builtin:swc-loader',
          options: swcConfig,
        },
      ],
    },
  });
}

/**
 * Signal that `Meteor.isDevelopment` and `Meteor.isProduction` should be omitted
 * from DefinePlugin, making the bundle portable across Meteor environments.
 * Usage: return Meteor.enablePortableBuild() in your rspack.config.js
 *
 * @returns {Record<string, object>} config fragment with `meteor.enablePortableBuild: true`
 */
function enablePortableBuild() {
  return prepareMeteorRspackConfig({
    "meteor.enablePortableBuild": true,
  });
}

/**
 * Remove plugins from a Rspack config by name, RegExp, predicate, or array of them.
 * When using a function predicate, it receives both the plugin and its index in the plugins array.
 *
 * @param {object} config Rspack config object
 * @param {string | RegExp | ((plugin: any, index: number) => boolean) | Array<string|RegExp|Function>} matchers
 * @returns {object} The modified config object
 */
function disablePlugins(config, matchers) {
  if (!config || typeof config !== "object") {
    throw new TypeError("disablePlugins: `config` must be an object");
  }

  const plugins = Array.isArray(config.plugins) ? config.plugins : [];
  const kept = [];

  const list = Array.isArray(matchers) ? matchers : [matchers];

  const getPluginName = (p) => {
    if (!p) return "";
    return (
      (p.constructor && typeof p.constructor.name === "string" && p.constructor.name) ||
      (typeof p.name === "string" && p.name) ||
      (typeof p.pluginName === "string" && p.pluginName) ||
      (typeof p.__pluginName === "string" && p.__pluginName) ||
      ""
    );
  };

  const predicates = list.map((m) => {
    if (typeof m === "function") return m;
    if (m instanceof RegExp) {
      return (p) => m.test(getPluginName(p));
    }
    if (typeof m === "string") {
      return (p) => getPluginName(p) === m;
    }
    throw new TypeError(
      "disablePlugins: matchers must be string, RegExp, function, or array of them"
    );
  });

  config.plugins = plugins.filter((p, index) => {
    const matches = predicates.some(fn => fn(p, index));
    return !matches;
  });

  return config;
}

/**
 * Create a `writeToDisk` callback that persists specific files to disk
 * during development.
 *
 * Accepts an array (defaults to "always" strategy) or an object with
 * `once` and/or `always` keys for mixed strategies.
 *
 * Matchers can be:
 * - **string**: matched with `endsWith` (e.g. `'sw.js'`, `'.html'`)
 * - **RegExp**: tested against the full file path
 * - **function**: `(filePath: string) => boolean`
 *
 * Strategies:
 * - `always`: Write on every build (default). Use for files that should
 *             always reflect the latest build output.
 * - `once`:   Write on the first build only. Skipped on HMR rebuilds to
 *             avoid triggering service worker re-registration or file
 *             watcher restarts.
 *
 * @example
 * // Simple: array defaults to "always"
 * ...Meteor.persistDevFiles(['manifest.json'])
 *
 * // Mixed strategies with strings, regex, and functions
 * ...Meteor.persistDevFiles({
 *   once: ['sw.js', /\.worker\.js$/],
 *   always: ['manifest.json', (filePath) => filePath.includes('/custom/')],
 * })
 *
 * @param {(string|RegExp|Function)[] | { once?: (string|RegExp|Function)[], always?: (string|RegExp|Function)[] }} matchers
 * @returns {Record<string, object>} config fragment with devServer.devMiddleware.writeToDisk
 */
/**
 * Build the writeToDisk callback from matchers.
 * Shared by persistDevFiles (fragment) and internal usage (direct).
 * @private
 */
function createPersistCallback(matchers) {
  const once = [];
  const always = [];

  if (Array.isArray(matchers)) {
    always.push(...matchers);
  } else {
    if (matchers.once) once.push(...matchers.once);
    if (matchers.always) always.push(...matchers.always);
  }

  // HTML files are always persisted, Meteor's web server relies on them
  if (!always.includes('.html')) {
    always.push('.html');
  }

  const match = (filePath, pattern) => {
    if (typeof pattern === 'function') return pattern(filePath);
    if (typeof pattern === 'string') return filePath.endsWith(pattern);
    return pattern.test(filePath);
  };

  const written = new Set();

  return (filePath) => {
    for (const pattern of always) {
      if (match(filePath, pattern)) return true;
    }
    for (let i = 0; i < once.length; i++) {
      if (match(filePath, once[i])) {
        if (written.has(i)) return false;
        written.add(i);
        return true;
      }
    }
    return false;
  };
}

function persistDevFiles(matchers) {
  return prepareMeteorRspackConfig({
    devServer: {
      devMiddleware: {
        writeToDisk: createPersistCallback(matchers),
      },
    },
  });
}

function outputMeteorRspack(data) {
  const jsonString = JSON.stringify(data);
  const output = `[Meteor-Rspack]${jsonString}[/Meteor-Rspack]`;
  console.log(output);
}

module.exports = {
  compileWithMeteor,
  compileWithRspack,
  setCache,
  splitVendorChunk,
  extendSwcConfig,
  replaceSwcConfig,
  makeWebNodeBuiltinsAlias,
  disablePlugins,
  outputMeteorRspack,
  enablePortableBuild,
  persistDevFiles,
  createPersistCallback,
};
