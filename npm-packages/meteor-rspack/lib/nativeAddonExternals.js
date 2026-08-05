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

// Runtime loaders that strongly indicate a package can load native code.
// Header-only build dependencies such as nan and node-addon-api are excluded
// because their presence alone does not make the consuming package native.
const NATIVE_RUNTIME_LOADER_DEPENDENCIES = [
  'bindings',
  'node-gyp-build',
  'node-pre-gyp',
  '@mapbox/node-pre-gyp',
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

function isPathWithin(candidate, parent) {
  if (!candidate || !parent) return false;
  const relative = path.relative(parent, candidate);
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

/**
 * Determine whether an installed package request was explicitly forced back
 * through Rspack. Conditions follow Rspack's string, RegExp, and function
 * matching forms and are checked against both resolved paths and specifiers.
 * @param {Array<string|RegExp|Function>} conditions
 * @param {{ request: string; packageName: string; packageDir: string; resourcePath?: string }} details
 * @returns {boolean}
 */
function shouldForceBundle(conditions, details) {
  if (!conditions.length) return false;

  const { request, packageName, packageDir, resourcePath } = details;
  const pathCandidates = [...new Set([resourcePath, packageDir].filter(Boolean))];
  const candidates = [...pathCandidates, request, packageName];

  return conditions.some((condition) => {
    if (typeof condition === 'string') {
      if (
        condition === packageName ||
        request === condition ||
        request.startsWith(`${condition}/`)
      ) {
        return true;
      }
      return pathCandidates.some((candidate) =>
        isPathWithin(candidate, condition)
      );
    }
    if (condition instanceof RegExp) {
      return candidates.some((candidate) => {
        condition.lastIndex = 0;
        return condition.test(candidate);
      });
    }
    if (typeof condition === 'function') {
      return candidates.some((candidate) => condition(candidate));
    }
    return false;
  });
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
 * Check whether a directory contains a `*.node` file.
 * @param {string} dir - Directory to scan
 * @param {Object} [options]
 * @param {boolean} [options.recursive=false] - Scan child directories
 * @param {number} [options.maxEntries=10000] - Bound synchronous work
 * @returns {boolean}
 */
function hasDotNodeFile(dir, options = {}) {
  const { recursive = false, maxEntries = 10000 } = options;
  const pending = [dir];
  let visitedEntries = 0;

  while (pending.length > 0 && visitedEntries < maxEntries) {
    const currentDir = pending.pop();
    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (error) {
      continue;
    }

    for (const entry of entries) {
      visitedEntries += 1;
      if (entry.isFile() && entry.name.endsWith('.node')) {
        return true;
      }
      if (
        recursive &&
        entry.isDirectory() &&
        entry.name !== 'node_modules' &&
        entry.name !== '.git'
      ) {
        pending.push(path.join(currentDir, entry.name));
      }
      if (visitedEntries >= maxEntries) {
        break;
      }
    }
  }

  return false;
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
    if (hasDotNodeFile(packageDir, { recursive: true })) {
      return true;
    }

    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')
    );
    if (pkgJson.gypfile === true) {
      return true;
    }
    const dependencies = {
      ...(pkgJson.dependencies || {}),
      ...(pkgJson.optionalDependencies || {}),
    };
    if (NATIVE_RUNTIME_LOADER_DEPENDENCIES.some((dep) => dependencies[dep])) {
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
 * node_modules. Such a path cannot be required portably from a bundle
 * built on another machine.
 * @param {string} absolutePath - Absolute path to convert
 * @returns {string|null} - Bare specifier or null
 */
function toBareSpecifier(absolutePath) {
  const parts = absolutePath.split(/[\\/]+/);
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
  if (
    options.forceBundle != null &&
    !Array.isArray(options.forceBundle)
  ) {
    throw new TypeError('forceBundle must be an array');
  }
  const forceBundle = options.forceBundle || [];
  // Native-or-not verdict keyed by resolved package directory
  const verdictByDir = new Map();
  // Located package directory (or null) keyed by issuer context + package
  // name. Resolution is context dependent (workspaces, nested
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

    if (options.enabled === false) {
      return callback();
    }

    // Meteor packages are handled by another external
    if (request.startsWith('meteor/')) {
      return callback();
    }

    // Direct requests for compiled addon binaries are externalized as bare
    // specifiers: rspack cannot parse them, and node_modules exists on disk
    // at server runtime. Absolute build-machine paths must never be emitted
    // into the bundle because they break as soon as the bundle is deployed to
    // another path or machine.
    if (request.endsWith('.node')) {
      const isRelativeOrAbsolute =
        request.startsWith('.') || path.isAbsolute(request);
      const absolutePath = isRelativeOrAbsolute
        ? path.isAbsolute(request)
          ? request
          : context
          ? path.resolve(context, request)
          : null
        : null;
      const bareSpecifier = absolutePath
        ? toBareSpecifier(absolutePath)
        : request;
      const packageName = bareSpecifier && getPackageName(bareSpecifier);
      const packageDir = packageName
        ? findPackageDir(context, packageName)
        : null;

      if (
        packageName &&
        packageDir &&
        shouldForceBundle(forceBundle, {
          request: bareSpecifier,
          packageName,
          packageDir,
          resourcePath: absolutePath || path.join(
            packageDir,
            bareSpecifier.slice(packageName.length).replace(/^\/+/, '')
          ),
        })
      ) {
        return callback();
      }

      if (isRelativeOrAbsolute) {
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

    const packageSubpath = request
      .slice(packageName.length)
      .replace(/^\/+/, '');
    if (
      shouldForceBundle(forceBundle, {
        request,
        packageName,
        packageDir,
        resourcePath: path.join(packageDir, packageSubpath),
      })
    ) {
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
  getPackageName,
  hasDotNodeFile,
  isNativeAddonPackage,
  shouldForceBundle,
  toBareSpecifier,
};
