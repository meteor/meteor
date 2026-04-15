import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateTypes } from "../src/lib.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "__fixtures__");

function findPair(pairs, dtsBasename) {
  return pairs.find((p) => path.basename(p.dts) === dtsBasename);
}

describe("evaluateTypes", () => {
  test("reports 100% for a fully-covered pair", () => {
    const { pairs, orphans } = evaluateTypes(path.join(FIXTURES, "simple"));
    assert.deepEqual(orphans, []);
    assert.equal(pairs.length, 1);
    const [{ result }] = pairs;
    assert.equal(result.percent, 100);
    assert.equal(result.total, 1);
    assert.equal(result.uncovered.length, 0);
    assert.equal(result.covered[0].name, "Foo");
  });

  test("reports partial coverage with uncovered names", () => {
    const { pairs } = evaluateTypes(path.join(FIXTURES, "partial"));
    const [{ result }] = pairs;
    assert.equal(result.total, 2);
    assert.equal(result.covered.length, 1);
    assert.equal(result.uncovered.length, 1);
    assert.equal(result.percent, 50);
    assert.equal(result.uncovered[0].name, "Missed");
  });

  test("empty .d.ts reports 100%", () => {
    const { pairs } = evaluateTypes(path.join(FIXTURES, "empty-dts"));
    const [{ result }] = pairs;
    assert.equal(result.total, 0);
    assert.equal(result.percent, 100);
  });

  test("orphan test files are surfaced separately and returns early when there are no pairs", () => {
    const { pairs, orphans } = evaluateTypes(path.join(FIXTURES, "orphan"));
    assert.equal(pairs.length, 0);
    assert.ok(Array.isArray(orphans));
    assert.equal(orphans.length, 1);
  });

  test("covers every declaration kind when each is asserted", () => {
    const { pairs } = evaluateTypes(path.join(FIXTURES, "decls"));
    const pair = findPair(pairs, "all.d.ts");
    assert.ok(pair, "decls pair should be discovered");
    const { result } = pair;
    const coveredNames = result.covered.map((d) => d.name).sort();
    // IFace, Alias, Klass, Enum, Ns, fn, CONST_V, _default all asserted.
    for (const name of ["IFace", "Alias", "Klass", "Enum", "Ns", "fn", "CONST_V", "_default"]) {
      assert.ok(coveredNames.includes(name), `expected ${name} in covered, got ${coveredNames.join(", ")}`);
    }
    assert.ok(result.unrecognized.length > 0, "expected some unrecognized assertions");
  });

  test("re-exports resolve to underlying symbol and count as covered", () => {
    const { pairs } = evaluateTypes(path.join(FIXTURES, "reexport"));
    const pair = findPair(pairs, "index.d.ts");
    assert.ok(pair);
    assert.equal(pair.result.percent, 100);
    assert.equal(pair.result.covered[0].name, "Src");
  });
});
