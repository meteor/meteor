"use strict";

// Human-readable report for walk mode. Renders a line per (dts, test) pair
// with counts + percent + the names of the uncovered declarations, then a
// closing aggregate total. Colors come from utils.colorForPercent so the
// thresholds stay consistent across the whole CLI.

const chalk = require("chalk");
const { relOrAbs, colorForPercent } = require("./utils");

// Fold per-pair results into overall totals. Exposed so the CLI's JSON mode
// can reuse the exact same math without going through the text renderer.
function aggregateTotals(pairs) {
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
// Padding keeps the columns aligned even when counts vary.
function renderPairRow({ dts, result }) {
  const color = colorForPercent(result.percent);
  const missing = result.uncovered.length
    ? chalk.dim(` \u2014 missing: ${result.uncovered.map((d) => d.name).join(", ")}`)
    : "";
  const count = color(`${result.covered.length}/${result.total}`.padStart(5));
  const pct = color(`${String(result.percent).padStart(3)}%`);
  return `  ${count} ${pct}  ${relOrAbs(dts)}${missing}`;
}

function renderAggregateReport({ cwd, pairs, orphans, verbose }) {
  const { totalDecls, totalCovered, percent } = aggregateTotals(pairs);

  const lines = [
    "",
    chalk.bold("Type-test coverage (directory mode)"),
    `  ${chalk.dim("root:")} ${relOrAbs(cwd)}`,
    `  ${chalk.dim("pairs:")} ${pairs.length}`,
    "",
  ];

  for (const pair of pairs) {
    lines.push(renderPairRow(pair));
    // --verbose: surface how many assertion calls in this test file we could
    // not attribute to any declaration (usually a sign the test is exercising
    // something that's not exported or our matcher missed it).
    if (verbose && pair.result.unrecognized.length) {
      lines.push(chalk.dim(`        ${pair.result.unrecognized.length} unrecognized assertion(s)`));
    }
  }

  // Tests with no sibling *.d.ts — called out separately because they are
  // almost always a mistake (misnamed file, missing declaration, etc.).
  if (orphans.length) {
    lines.push("");
    lines.push(chalk.yellow(`Orphan test files (no sibling .d.ts): ${orphans.length}`));
    for (const o of orphans) lines.push(`  ${chalk.yellow("!")} ${relOrAbs(o)}`);
  }

  const color = colorForPercent(percent);
  lines.push("");
  lines.push(color(`Total: ${totalCovered}/${totalDecls} declarations covered (${percent}%)`));
  lines.push("");

  // Return the precomputed percent too — the CLI uses it for its exit code
  // without having to re-aggregate.
  return { text: lines.join("\n"), percent, totalCovered, totalDecls };
}

module.exports = { renderAggregateReport, aggregateTotals };
