let currentContext = null;

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

function clearTestRunnerContext() {
  currentContext = null;
}

module.exports = {
  cloneJsonSafe,
  clearTestRunnerContext,
  getTestRunnerBuildOptions,
  setTestRunnerContext,
};
