const test = require("node:test");
const assert = require("node:assert/strict");

const { buildNativeTestEnv } = require("./env");

test("buildNativeTestEnv removes NO_COLOR while preserving other env values", () => {
  const env = buildNativeTestEnv({
    EXISTING: "1",
    NO_COLOR: "1",
  }, {
    PORT: "3000",
  });

  assert.equal(env.EXISTING, "1");
  assert.equal(env.PORT, "3000");
  assert.equal("NO_COLOR" in env, false);
});

test("buildNativeTestEnv disables package usage stats by default", () => {
  const env = buildNativeTestEnv({
    DO_NOT_TRACK: "0",
  });

  assert.equal(env.DO_NOT_TRACK, "1");
});
