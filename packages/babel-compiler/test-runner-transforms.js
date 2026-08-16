(function (global) {
  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  }

  function isJsonSafe(value, seen = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
      return true;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value);
    }
    if (typeof value !== 'object' || seen.has(value)) {
      return false;
    }
    if (!Array.isArray(value) && !isPlainObject(value)) {
      return false;
    }

    seen.add(value);
    const values = Array.isArray(value) ? value : Object.values(value);
    const result = values.every(entry => isJsonSafe(entry, seen));
    seen.delete(value);
    return result;
  }

  function cloneJson(value) {
    if (value === null || typeof value !== 'object') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map(cloneJson);
    }
    return Object.keys(value).sort().reduce((copy, key) => {
      copy[key] = cloneJson(value[key]);
      return copy;
    }, {});
  }

  function stableStringify(value) {
    if (value === null) {
      return 'null';
    }
    if (typeof value === 'string' || typeof value === 'boolean' ||
        typeof value === 'number') {
      return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
      return `[${value.map(stableStringify).join(',')}]`;
    }
    return `{${Object.keys(value).sort().map(key =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(',')}}`;
  }

  function getNodeModule(name) {
    if (typeof Npm !== 'undefined') {
      return Npm.require(name);
    }
    return require(name);
  }

  function getCrypto() {
    return getNodeModule('crypto');
  }

  function isAbsolutePath(value) {
    if (typeof value !== 'string') {
      return false;
    }
    const path = getNodeModule('path');
    return path.isAbsolute(value) || path.win32.isAbsolute(value);
  }

  function fingerprint(value) {
    return getCrypto().createHash('sha256').update(stableStringify(value)).digest('hex');
  }

  function normalizePlugins(plugins) {
    if (plugins === undefined) {
      return [];
    }
    if (!Array.isArray(plugins)) {
      return null;
    }

    const normalized = [];
    const seen = new Set();
    for (const plugin of plugins) {
      if (!Array.isArray(plugin) || plugin.length !== 2 ||
          !isAbsolutePath(plugin[0]) ||
          !isJsonSafe(plugin[1])) {
        return null;
      }
      const normalizedPlugin = [plugin[0], cloneJson(plugin[1])];
      const key = stableStringify(normalizedPlugin);
      if (!seen.has(key)) {
        seen.add(key);
        normalized.push(normalizedPlugin);
      }
    }
    return normalized;
  }

  function selectTestSourceTransforms({ packageName, options }) {
    if (!packageName || !isPlainObject(options) ||
        !Array.isArray(options.includePackages) ||
        !options.includePackages.every(name => typeof name === 'string') ||
        !options.includePackages.includes(packageName) ||
        !isPlainObject(options.packageRoots)) {
      return null;
    }

    const packageRoot = options.packageRoots[packageName];
    if (!isAbsolutePath(packageRoot) ||
        typeof options.cacheKey !== 'string') {
      return null;
    }

    const swcPlugins = normalizePlugins(options.swcPlugins);
    const babelPlugins = normalizePlugins(options.babelPlugins);
    if (!swcPlugins || !babelPlugins) {
      return null;
    }

    const selected = {
      packageRoot,
      cacheKey: options.cacheKey,
      swcPlugins,
      babelPlugins,
    };
    selected.cacheFingerprint = fingerprint({ packageName, ...selected });
    return selected;
  }

  function pluginFingerprint(plugin) {
    return isJsonSafe(plugin) ? stableStringify(plugin) : null;
  }

  function appendPlugins(existing, additions) {
    const fingerprints = new Set(existing.map(pluginFingerprint).filter(Boolean));
    const result = existing.slice();
    for (const plugin of additions) {
      const key = pluginFingerprint(plugin);
      if (!fingerprints.has(key)) {
        fingerprints.add(key);
        result.push(plugin);
      }
    }
    return result;
  }

  function appendTransformPlugins(options, kind, transform) {
    if (!transform) {
      return options;
    }

    if (kind === 'babel') {
      options.plugins = appendPlugins(options.plugins || [], transform.babelPlugins);
    } else if (kind === 'swc') {
      options.jsc = options.jsc || {};
      options.jsc.experimental = options.jsc.experimental || {};
      options.jsc.experimental.plugins = appendPlugins(
        options.jsc.experimental.plugins || [],
        transform.swcPlugins,
      );
    }
    return options;
  }

  function forInput(inputFile) {
    if (typeof Plugin === 'undefined' ||
        typeof Plugin.getTestRunnerBuildOptions !== 'function') {
      return null;
    }
    const buildOptions = Plugin.getTestRunnerBuildOptions();
    return selectTestSourceTransforms({
      packageName: inputFile.getPackageName(),
      options: buildOptions && buildOptions.sourceTransforms,
    });
  }

  const api = {
    apply: appendTransformPlugins,
    appendTransformPlugins,
    forInput,
    selectTestSourceTransforms,
  };
  global.BabelTestRunnerTransforms = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(globalThis);
