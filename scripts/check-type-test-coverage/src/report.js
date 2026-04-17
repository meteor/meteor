// Human-readable report for walk mode. Renders a line per (dts, test) pair
// with counts + percent + the names of the uncovered declarations, then a
// closing aggregate total. Colors come from utils.colorize so the
// thresholds stay consistent across the whole CLI.

import { styleText } from "node:util";
import { relOrAbs, colorize } from "./utils.js";

// Fold per-pair results into overall totals. Exposed so the CLI's JSON mode
// can reuse the exact same math without going through the text renderer.
export function aggregateTotals(pairs) {
  let totalDecls = 0;
  let totalCovered = 0;
  for (const { result } of pairs) {
    totalDecls += result.total;
    totalCovered += result.covered.length;
  }
  // No declarations across any pair → 100% (nothing to miss).
  const percent = totalDecls === 0 ? 100 : Math.round((totalCovered / totalDecls) * 100);
  return { totalDecls, totalCovered, percent };
}

// One line per pair: "  2/5  40%  packages/foo/foo.d.ts — missing: A, B, C"
// Padding keeps the columns aligned even when counts vary. When `test` is
// null, the row belongs to an untested .d.ts and we flag it explicitly so
// readers don't mistake a 0% row for a broken test file.
function renderPairRow({ dts, test, result }) {
  const missing = result.uncovered.length
    ? styleText("dim", ` \u2014 missing: ${result.uncovered.map((d) => d.name).join(", ")}`)
    : "";
  const count = colorize(result.percent, `${result.covered.length}/${result.total}`.padStart(5));
  const pct = colorize(result.percent, `${String(result.percent).padStart(3)}%`);
  const marker = test === null ? styleText("dim", " (no test file)") : "";
  return `  ${count} ${pct}  ${relOrAbs(dts)}${marker}${missing}`;
}

export function renderAggregateReport({ cwd, pairs, orphans, verbose }) {
  const { totalDecls, totalCovered, percent } = aggregateTotals(pairs);
  const untestedCount = pairs.filter((p) => p.test === null).length;
  const testedCount = pairs.length - untestedCount;

  const lines = [
    "",
    styleText("bold", "Type-test coverage (directory mode)"),
    `  ${styleText("dim", "root:")} ${relOrAbs(cwd)}`,
    `  ${styleText("dim", "pairs:")} ${testedCount}`,
    `  ${styleText("dim", "untested:")} ${untestedCount}`,
    "",
  ];

  for (const pair of pairs) {
    lines.push(renderPairRow(pair));
    // --verbose: surface how many assertion calls in this test file we could
    // not attribute to any declaration (usually a sign the test is exercising
    // something that's not exported or our matcher missed it).
    if (verbose && pair.result.unrecognized.length) {
      lines.push(styleText("dim", `        ${pair.result.unrecognized.length} unrecognized assertion(s)`));
    }
  }

  // Tests with no sibling *.d.ts — called out separately because they are
  // almost always a mistake (misnamed file, missing declaration, etc.).
  if (orphans.length) {
    lines.push("");
    lines.push(styleText("yellow", `Orphan test files (no sibling .d.ts): ${orphans.length}`));
    for (const o of orphans) lines.push(`  ${styleText("yellow", "!")} ${relOrAbs(o)}`);
  }

  lines.push("");
  lines.push(colorize(percent, `Total: ${totalCovered}/${totalDecls} declarations covered (${percent}%)`));
  lines.push("");

  // Return the precomputed percent too — the CLI uses it for its exit code
  // without having to re-aggregate.
  return { text: lines.join("\n"), percent, totalCovered, totalDecls };
}
