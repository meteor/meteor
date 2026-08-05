const fs = require('fs');
const path = require('path');

/**
 * Externalize npm packages that ship compiled native addons.
 *
 * Rspack cannot parse `.node` binaries ("Module parse failed: JavaScript
 * parse error: Unexpected character ...") and cannot statically resolve the
 * dynamic lookups used by helpers such as `bindings` or `node-gyp-build`
 * ("Module not found: Can't resolve './build/Release/...'"). Since
 * `node_modules` is present at server runtime, these packages can always be
 * loaded with a plain `require` instead of being bundled, so on the server we
 * externalize them as commonjs.
 */

// Dependencies that only appear in packages that compile or load native code.
const NATIVE_INDICATOR_DEPENDENCIES = [
  'bindings',
  'node-gyp-build',
  'prebuild-install',
  'node-pre-gyp',
  '@mapbox/node-pre-gyp',
  'nan',
  'node-addon-api',
];

/**
 * Extract the npm package name from a bare request
 * (`@scope/name/sub/path` -> `@scope/name`, `name/sub/path` -> `name`)
 * @param {string} request - Bare module request
 * @returns {string|null} - Package name or null if it cannot be determined
 */
function getPackageName(request) {
  const parts = request.split('/');
  if (request.startsWith('@')) {
    return parts.length >= 2 && parts[1] ? `${parts[0]}/${parts[1]}` : null;
  }
  return parts[0] || null;
}

/**
 * Locate a package directory by walking up from the issuer context and
 * checking `<dir>/node_modules/<pkgName>/package.json` at each level.
 * @param {string} context - Directory of the issuing module
 * @param {string} packageName - npm package name
 * @returns {string|null} - Absolute package directory or null
 */
function findPackageDir(context, packageName) {
  if (!context) {
    return null;
  }

  let dir = context;
  while (true) {
    const candidate = path.join(dir, 'node_modules', packageName);
    try {
      if (fs.existsSync(path.join(candidate, 'package.json'))) {
        return candidate;
      }
    } catch (error) {
      // Ignore fs errors and keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }

  return null;
}

/**
 * Check whether a directory contains any `*.node` file (shallow readdir).
 * @param {string} dir - Directory to scan
 * @returns {boolean}
 */
function hasDotNodeFile(dir) {
  try {
    return fs.readdirSync(dir).some((entry) => entry.endsWith('.node'));
  } catch (error) {
    // Missing or unreadable directory: treat as no .node files
    return false;
  }
}

/**
 * Detect whether a package directory belongs to a native addon package.
 * Any single indicator suffices; all fs access fails safe to "not native".
 * @param {string} packageDir - Absolute package directory
 * @returns {boolean}
 */
function isNativeAddonPackage(packageDir) {
  try {
    if (fs.existsSync(path.join(packageDir, 'binding.gyp'))) {
      return true;
    }
    if (fs.existsSync(path.join(packageDir, 'prebuilds'))) {
      return true;
    }
    if (hasDotNodeFile(packageDir)) {
      return true;
    }
    if (hasDotNodeFile(path.join(packageDir, 'build', 'Release'))) {
      return true;
    }

    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')
    );
    if (pkgJson.gypfile === true) {
      return true;
    }
    const dependencies = pkgJson.dependencies || {};
    if (NATIVE_INDICATOR_DEPENDENCIES.some((dep) => dependencies[dep])) {
      return true;
    }
  } catch (error) {
    // Fail safe: bundle as before
  }

  return false;
}

/**
 * Convert an absolute path inside a node_modules tree into the bare
 * specifier that resolves to it at runtime (`.../node_modules/@scope/pkg/a.node`
 * -> `@scope/pkg/a.node`). Returns null when the path is not inside
 * node_modules — such a path cannot be required portably from a bundle
 * built on another machine.
 * @param {string} absolutePath - Absolute path to convert
 * @returns {string|null} - Bare specifier or null
 */
function toBareSpecifier(absolutePath) {
  const parts = absolutePath.split(path.sep);
  const idx = parts.lastIndexOf('node_modules');
  if (idx === -1 || idx === parts.length - 1) {
    return null;
  }
  return parts.slice(idx + 1).join('/');
}

/**
 * Create an async webpack/rspack externals function that externalizes
 * native addon packages (and direct `.node` requests) as commonjs.
 * @param {Object} options
 * @param {Function} [options.onExternalized] - Called once per unique
 *   externalized package name, e.g. for logging
 * @returns {Function} - Externals function `(data, callback)`
 */
function createNativeAddonExternals(options = {}) {
  // Native-or-not verdict keyed by resolved package directory
  const verdictByDir = new Map();
  // Located package directory (or null) keyed by issuer context + package
  // name — resolution is context dependent (workspaces, nested
  // node_modules), so misses must not be cached globally by name alone
  const dirByContextName = new Map();
  // Packages already reported through onExternalized
  const reported = new Set();

  function reportExternalized(packageName) {
    if (typeof options.onExternalized !== 'function') {
      return;
    }
    if (reported.has(packageName)) {
      return;
    }
    reported.add(packageName);
    options.onExternalized(packageName);
  }

  return function nativeAddonExternals(data, callback) {
    const { context, request } = data;

    if (typeof request !== 'string') {
      return callback();
    }

    // Meteor packages are handled by another external
    if (request.startsWith('meteor/')) {
      return callback();
    }

    // Direct requests for compiled addon binaries are externalized as bare
    // specifiers: rspack cannot parse them, and node_modules exists on disk
    // at server runtime. Absolute build-machine paths must never be emitted
    // into the bundle — they break as soon as the bundle is deployed to
    // another path or machine.
    if (request.endsWith('.node')) {
      if (request.startsWith('.') || path.isAbsolute(request)) {
        const absolutePath = path.isAbsolute(request)
          ? request
          : context
          ? path.resolve(context, request)
          : null;
        const bareSpecifier = absolutePath && toBareSpecifier(absolutePath);
        if (bareSpecifier) {
          reportExternalized(bareSpecifier);
          return callback(null, 'commonjs ' + bareSpecifier);
        }
        // Not inside node_modules (e.g. an app-level .node file): fall
        // through to normal bundling so a build error surfaces instead of
        // a bundle that silently breaks after deployment.
        return callback();
      }
      // Bare specifier, e.g. `pkg/build/Release/foo.node`
      reportExternalized(getPackageName(request) || request);
      return callback(null, 'commonjs ' + request);
    }

    // Only bare package specifiers from here on
    if (
      request.startsWith('.') ||
      request.startsWith('!') ||
      path.isAbsolute(request)
    ) {
      return callback();
    }

    const packageName = getPackageName(request);
    if (!packageName) {
      return callback();
    }

    const dirCacheKey = `${context || ''}\0${packageName}`;
    let packageDir;
    if (dirByContextName.has(dirCacheKey)) {
      packageDir = dirByContextName.get(dirCacheKey);
    } else {
      packageDir = findPackageDir(context, packageName);
      dirByContextName.set(dirCacheKey, packageDir);
    }
    if (!packageDir) {
      return callback();
    }

    let isNative;
    if (verdictByDir.has(packageDir)) {
      isNative = verdictByDir.get(packageDir);
    } else {
      isNative = isNativeAddonPackage(packageDir);
      verdictByDir.set(packageDir, isNative);
    }

    if (isNative) {
      reportExternalized(packageName);
      // Externalize the full original request so subpath imports keep working
      return callback(null, 'commonjs ' + request);
    }

    return callback();
  };
}

module.exports = {
  createNativeAddonExternals,
};
