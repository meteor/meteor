// Isobuild evaluates package imports before the hosted file runtime starts.
// Defer public API access until the provider registers that runtime.
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

module.exports = { RSTEST_RUNTIME_SHIM };
