import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { aggregateTotals, renderAggregateReport } from "../src/report.js";

function pair({ dts = "a.d.ts", test: testPath = "a.test-d.ts", total, covered, unrecognized = [] }) {
  const coveredList = Array.from({ length: covered }, (_, i) => ({ name: `C${i}`, kind: "interface", line: i + 1 }));
  const uncoveredList = Array.from({ length: total - covered }, (_, i) => ({ name: `U${i}`, kind: "interface", line: covered + i + 1 }));
  const percent = total === 0 ? 100 : Math.round((covered / total) * 100);
  return { dts, test: testPath, result: { covered: coveredList, uncovered: uncoveredList, unrecognized, percent, total } };
}

function untestedPair({ dts = "u.d.ts", total }) {
  return pair({ dts, test: null, total, covered: 0 });
}

describe("report", () => {
  describe("aggregateTotals", () => {
    test("empty pairs -> 100%", () => {
      assert.deepEqual(aggregateTotals([]), { totalDecls: 0, totalCovered: 0, percent: 100 });
    });

    test("sums declarations and covered across pairs", () => {
      const pairs = [pair({ total: 4, covered: 2 }), pair({ total: 6, covered: 6 })];
      assert.deepEqual(aggregateTotals(pairs), { totalDecls: 10, totalCovered: 8, percent: 80 });
    });

    test("zero decls across pairs still yields 100%", () => {
      const pairs = [pair({ total: 0, covered: 0 }), pair({ total: 0, covered: 0 })];
      assert.equal(aggregateTotals(pairs).percent, 100);
    });
  });

  describe("renderAggregateReport", () => {
    test("renders title, per-pair rows, and total line", () => {
      const { text, percent, totalCovered, totalDecls } = renderAggregateReport({
        cwd: process.cwd(),
        pairs: [pair({ dts: "foo.d.ts", total: 2, covered: 1 })],
        orphans: [],
        verbose: false,
      });
      assert.match(text, /Type-test coverage/);
      assert.match(text, /foo\.d\.ts/);
      assert.match(text, /pairs:.*1/);
      assert.match(text, /untested:.*0/);
      assert.match(text, /missing: U0/);
      assert.match(text, /Total: 1\/2 declarations covered \(50%\)/);
      assert.equal(percent, 50);
      assert.equal(totalCovered, 1);
      assert.equal(totalDecls, 2);
    });

    test("renders untested .d.ts rows with (no test file) marker and 0% total impact", () => {
      const { text, percent, totalCovered, totalDecls } = renderAggregateReport({
        cwd: process.cwd(),
        pairs: [
          pair({ dts: "ok.d.ts", total: 2, covered: 2 }),
          untestedPair({ dts: "naked.d.ts", total: 3 }),
        ],
        orphans: [],
        verbose: false,
      });
      assert.match(text, /naked\.d\.ts/);
      assert.match(text, /no test file/);
      assert.match(text, /pairs:.*1/);
      assert.match(text, /untested:.*1/);
      assert.match(text, /Total: 2\/5 declarations covered \(40%\)/);
      assert.equal(percent, 40);
      assert.equal(totalCovered, 2);
      assert.equal(totalDecls, 5);
    });

    test("omits missing list when all covered", () => {
      const { text } = renderAggregateReport({
        cwd: process.cwd(),
        pairs: [pair({ dts: "foo.d.ts", total: 1, covered: 1 })],
        orphans: [],
        verbose: false,
      });
      assert.doesNotMatch(text, /missing:/);
    });

    test("--verbose adds unrecognized assertion counts", () => {
      const p = pair({ total: 1, covered: 1, unrecognized: [{ line: 3, text: "expectType(x)" }] });
      const verboseText = renderAggregateReport({ cwd: process.cwd(), pairs: [p], orphans: [], verbose: true }).text;
      assert.match(verboseText, /1 unrecognized assertion/);

      const quiet = renderAggregateReport({ cwd: process.cwd(), pairs: [p], orphans: [], verbose: false }).text;
      assert.doesNotMatch(quiet, /unrecognized assertion/);
    });

    test("flags orphan files", () => {
      const { text } = renderAggregateReport({
        cwd: process.cwd(),
        pairs: [],
        orphans: ["only.test-d.ts"],
        verbose: false,
      });
      assert.match(text, /Orphan test files/);
      assert.match(text, /only\.test-d\.ts/);
    });
  });
});
