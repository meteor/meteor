import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");
const CLI = path.join(PROJECT_ROOT, "index.js");
const FIXTURES = path.join(__dirname, "__fixtures__");

function run(args, cwd = PROJECT_ROOT) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

describe("cli", () => {
  test("no args prints HELP with exit 2", () => {
    const r = run([]);
    assert.equal(r.status, 2);
    assert.match(r.stdout, /Usage:/);
  });

  test("--help prints HELP with exit 0", () => {
    const r = run(["--help"]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Usage:/);
  });

  test("-h short flag works", () => {
    const r = run(["-h"]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /Usage:/);
  });

  test("unknown flag fails with exit 2", () => {
    const r = run(["--nope"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Usage:/);
  });

  test("two positional args fails with exit 2", () => {
    const r = run(["a", "b"]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Expected exactly 1 arg/);
  });

  test("non-numeric --min fails", () => {
    const r = run(["--min", "abc", path.join(FIXTURES, "simple")]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /--min expects/);
  });

  test("out-of-range --min fails", () => {
    assert.equal(run(["--min", "-1", path.join(FIXTURES, "simple")]).status, 2);
    assert.equal(run(["--min", "101", path.join(FIXTURES, "simple")]).status, 2);
  });

  test("missing directory fails with exit 2", () => {
    const r = run([path.join(FIXTURES, "does-not-exist")]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /Directory not found/);
  });

  test("100% coverage fixture + --min 100 → exit 0", () => {
    const r = run([path.join(FIXTURES, "simple")]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /100%/);
  });

  test("partial fixture + --min 100 → exit 1", () => {
    const r = run([path.join(FIXTURES, "partial")]);
    assert.equal(r.status, 1);
  });

  test("partial fixture + --min 0 → exit 0", () => {
    const r = run(["--min", "0", path.join(FIXTURES, "partial")]);
    assert.equal(r.status, 0);
  });

  test("--json emits parseable JSON", () => {
    const r = run(["--json", path.join(FIXTURES, "simple")]);
    assert.equal(r.status, 0);
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.percent, 100);
    assert.equal(payload.totalDecls, 1);
    assert.equal(payload.totalCovered, 1);
    assert.ok(Array.isArray(payload.pairs));
    assert.ok(Array.isArray(payload.orphans));
  });

  test("--json respects --min for exit code", () => {
    const r = run(["--json", path.join(FIXTURES, "partial")]);
    assert.equal(r.status, 1);
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.percent, 50);
  });

  test("--verbose surfaces unrecognized assertions", () => {
    const r = run(["--min", "0", "--verbose", path.join(FIXTURES, "decls")]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /unrecognized assertion/);
  });
});
