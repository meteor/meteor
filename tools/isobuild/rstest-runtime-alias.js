const path = require('path');

const RSTEST_CORE_ENTRY = path.join(
  'node_modules',
  '@rstest',
  'core',
  'dist',
  'index.js',
);

const RSTEST_RUNTIME_SHIM = `
const check = name => {
  if (!globalThis.RSTEST_API?.[name]) {
    throw new Error(\`Rstest API '\${name}' is not registered yet, please make sure you are running in a rstest environment.\`);
  }
};
const wrap = name => new Proxy((...args) => {
  check(name);
  return globalThis.RSTEST_API[name](...args);
}, {
  get(target, key, receiver) {
    return globalThis.RSTEST_API?.[name]
      ? Reflect.get(globalThis.RSTEST_API[name], key, receiver)
      : Reflect.get(target, key, receiver);
  },
});
const utilities = name => new Proxy({}, {
  get(_target, key, receiver) {
    check(name);
    return Reflect.get(globalThis.RSTEST_API[name], key, receiver);
  },
});
export const expect = wrap('expect');
export const assert = wrap('assert');
export const it = wrap('it');
export const test = wrap('test');
export const describe = wrap('describe');
export const beforeAll = wrap('beforeAll');
export const afterAll = wrap('afterAll');
export const beforeEach = wrap('beforeEach');
export const afterEach = wrap('afterEach');
export const onTestFinished = wrap('onTestFinished');
export const onTestFailed = wrap('onTestFailed');
export const rstest = utilities('rstest');
export const rs = utilities('rs');
`;

function rstestRuntimeShimFor({ absPath, testRunner }) {
  if (testRunner !== 'rstest') return null;
  const normalized = path.normalize(absPath);
  if (!normalized.endsWith(RSTEST_CORE_ENTRY)) return null;
  return RSTEST_RUNTIME_SHIM;
}

module.exports = {
  RSTEST_RUNTIME_SHIM,
  rstestRuntimeShimFor,
};
