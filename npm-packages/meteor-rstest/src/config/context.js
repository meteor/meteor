const { AsyncLocalStorage } = require('node:async_hooks');
const path = require('node:path');

const CONTEXT_STORAGE = Symbol.for('@meteorjs/rstest/context-storage/v1');
if (!globalThis[CONTEXT_STORAGE]) {
  Object.defineProperty(globalThis, CONTEXT_STORAGE, {
    value: new AsyncLocalStorage(),
    configurable: false,
    enumerable: false,
    writable: false,
  });
}
const contextStorage = globalThis[CONTEXT_STORAGE];
const ROOT_FIELDS = ['appRoot', 'configRoot', 'harnessRoot', 'localDir'];

function invalidContext(message) {
  const error = new Error(`[Meteor Rstest] Invalid context: ${message}`);
  error.code = 'METEOR_RSTEST_INVALID_CONTEXT';
  return error;
}

function deepFreeze(value, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return value;
  }
  seen.add(value);
  for (const nested of Object.values(value)) {
    deepFreeze(nested, seen);
  }
  return Object.freeze(value);
}

function createMeteorRstestContext(input = {}) {
  const appRoot = input.appRoot;
  if (!path.isAbsolute(appRoot || '')) {
    throw invalidContext('appRoot must be an absolute path');
  }

  const normalized = {
    schemaVersion: 1,
    appRoot,
    configRoot: input.configRoot || appRoot,
    harnessRoot: input.harnessRoot || appRoot,
    localDir: input.localDir || path.join(appRoot, '.meteor', 'local'),
    command: input.command === 'test-packages' ? 'test-packages' : 'test',
    once: Boolean(input.once),
    verbose: Boolean(input.verbose),
    fullApp: Boolean(input.fullApp),
    packageTests: Boolean(input.packageTests),
    phase: input.phase === 'external' ? 'external' : 'native',
    client: input.client !== false,
    server: input.server !== false,
    architectures: Array.from(input.architectures || [
      ...(input.server === false ? [] : ['server']),
      ...(input.client === false ? [] : ['web.browser']),
    ]),
  };

  for (const field of ROOT_FIELDS) {
    if (!path.isAbsolute(normalized[field])) {
      throw invalidContext(`${field} must be an absolute path`);
    }
    normalized[field] = path.normalize(normalized[field]);
  }

  return deepFreeze(normalized);
}

function getMeteorRstestContext() {
  return contextStorage.getStore();
}

function withMeteorRstestContext(context, callback) {
  return contextStorage.run(context, callback);
}

module.exports = {
  createMeteorRstestContext,
  getMeteorRstestContext,
  withMeteorRstestContext,
};
