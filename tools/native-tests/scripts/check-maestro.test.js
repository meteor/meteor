const test = require("node:test");
const assert = require("node:assert/strict");
const { checkMaestro } = require("./check-maestro");

test("returns ok when maestro is on PATH", async () => {
  const result = await checkMaestro({
    exec: async () => ({ stdout: "Maestro 1.40.0", exitCode: 0 }),
  });
  assert.equal(result.ok, true);
  assert.match(result.version, /Maestro/);
});

test("returns not-ok with install hint when missing", async () => {
  const result = await checkMaestro({
    exec: async () => {
      throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.hint, /get\.maestro\.mobile\.dev/);
});

test("returns not-ok when maestro exits non-zero", async () => {
  const result = await checkMaestro({
    exec: async () => ({ stdout: "", stderr: "broken", exitCode: 1 }),
  });
  assert.equal(result.ok, false);
  assert.match(result.hint, /get\.maestro\.mobile\.dev/);
});
