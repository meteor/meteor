let currentContext = null;
const crypto = require('node:crypto');

function cloneJsonSafe(value, path = 'test runner context', seen = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'object') {
    throw new TypeError(`${path} must contain only JSON-safe values`);
  }
  if (seen.has(value)) {
    throw new TypeError(`${path} must contain only JSON-safe values (cycle found)`);
  }
  seen.add(value);

  let clone;
  if (Array.isArray(value)) {
    clone = value.map((entry, index) =>
      cloneJsonSafe(entry, `${path}[${index}]`, seen)
    );
  } else {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only JSON-safe values`);
    }
    clone = {};
    for (const [key, entry] of Object.entries(value)) {
      clone[key] = cloneJsonSafe(entry, `${path}.${key}`, seen);
    }
  }

  seen.delete(value);
  return Object.freeze(clone);
}

function setTestRunnerContext(context) {
  currentContext = cloneJsonSafe(context);
}

function getTestRunnerBuildOptions(packageName) {
  return currentContext && currentContext.buildPluginOptions
    ? currentContext.buildPluginOptions[packageName]
    : undefined;
}

function getTestRunnerBuildOptionsFingerprint(packageName) {
  const buildPluginOptions = currentContext && currentContext.buildPluginOptions || {};
  const options = {};
  for (const [buildPluginName, pluginOptions] of Object.entries(buildPluginOptions)) {
    const ownsOptions = buildPluginName === packageName;
    const transformsPackage = pluginOptions && pluginOptions.sourceTransforms &&
      Array.isArray(pluginOptions.sourceTransforms.includePackages) &&
      pluginOptions.sourceTransforms.includePackages.includes(packageName);
    if (ownsOptions || transformsPackage) {
      options[buildPluginName] = pluginOptions;
    }
  }
  if (Object.keys(options).length === 0) return null;
  return crypto.createHash('sha256')
    .update(JSON.stringify(options))
    .digest('hex');
}

function sameTestRunnerBuildOptionsFingerprint(cachedFingerprint, packageName) {
  return (cachedFingerprint ?? null) ===
    getTestRunnerBuildOptionsFingerprint(packageName);
}

function clearTestRunnerContext() {
  currentContext = null;
}

module.exports = {
  cloneJsonSafe,
  clearTestRunnerContext,
  getTestRunnerBuildOptions,
  getTestRunnerBuildOptionsFingerprint,
  sameTestRunnerBuildOptionsFingerprint,
  setTestRunnerContext,
};
