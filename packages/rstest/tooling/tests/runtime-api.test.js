const assert = require("node:assert/strict");
const test = require("node:test");
const { RSTEST_RUNTIME_SHIM } = require("../provider/runtime-api.js");

test("Isobuild API bridge binds to the active hosted file runtime", async (t) => {
  const previousApi = globalThis.RSTEST_API;
  t.after(() => {
    if (previousApi === undefined) delete globalThis.RSTEST_API;
    else globalThis.RSTEST_API = previousApi;
  });
  delete globalThis.RSTEST_API;
  const api = await import(`data:text/javascript,${encodeURIComponent(RSTEST_RUNTIME_SHIM)}`);

  assert.throws(() => api.test("early"), /Rstest API 'test' is not registered/);
  const calls = [];
  globalThis.RSTEST_API = {
    test: Object.assign((name) => calls.push(name), { skip: "first skip" }),
    rs: { fn: "first mock factory" },
  };
  api.test("first runtime");
  assert.equal(api.test.skip, "first skip");
  assert.equal(api.rs.fn, "first mock factory");

  globalThis.RSTEST_API = {
    test: Object.assign((name) => calls.push(name), { skip: "second skip" }),
    rs: { fn: "second mock factory" },
  };
  api.test("second runtime");
  assert.deepEqual(calls, ["first runtime", "second runtime"]);
  assert.equal(api.test.skip, "second skip");
  assert.equal(api.rs.fn, "second mock factory");
});
