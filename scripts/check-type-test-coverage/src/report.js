"use strict";

const path = require("path");
const chalk = require("chalk");

function relOrAbs(p) {
  const rel = path.relative(process.cwd(), p);
  return rel.startsWith("..") ? p : rel;
}

function renderReport({ dtsPath, testPath, result, verbose }) {
  const lines = [];
  lines.push("");
  lines.push(chalk.bold("Type-test coverage"));
  lines.push(`  ${chalk.dim("declarations:")} ${relOrAbs(dtsPath)}`);
  lines.push(`  ${chalk.dim("tests:       ")} ${relOrAbs(testPath)}`);
  lines.push("");

  const { covered, uncovered, unrecognized, percent, total } = result;

  if (covered.length) {
    lines.push(chalk.green(`Covered (${covered.length})`));
    for (const d of covered) {
      lines.push(`  ${chalk.green("\u2713")} [${d.kind}] ${d.name} ${chalk.dim(`:${d.line}`)}`);
    }
    lines.push("");
  }

  if (uncovered.length) {
    lines.push(chalk.red(`Uncovered (${uncovered.length})`));
    for (const d of uncovered) {
      lines.push(`  ${chalk.red("\u2717")} [${d.kind}] ${d.name} ${chalk.dim(`:${d.line}`)}`);
    }
    lines.push("");
  }

  if (unrecognized.length) {
    const shown = verbose ? unrecognized : unrecognized.slice(0, 3);
    lines.push(chalk.yellow(`Unrecognized assertions (${unrecognized.length})`));
    for (const u of shown) {
      lines.push(`  ${chalk.yellow("!")} ${chalk.dim(`:${u.line}`)} ${u.text}`);
    }
    if (!verbose && unrecognized.length > shown.length) {
      lines.push(chalk.dim(`  \u2026 ${unrecognized.length - shown.length} more (rerun with --verbose)`));
    }
    lines.push("");
  }

  const color = percent === 100 ? chalk.green : percent >= 50 ? chalk.yellow : chalk.red;
  lines.push(color(`${covered.length}/${total} declarations covered (${percent}%)`));
  lines.push("");

  return lines.join("\n");
}

function renderAggregateReport({ cwd, pairs, orphans, verbose }) {
  const lines = [];
  lines.push("");
  lines.push(chalk.bold("Type-test coverage (directory mode)"));
  lines.push(`  ${chalk.dim("root:")} ${relOrAbs(cwd)}`);
  lines.push(`  ${chalk.dim("pairs:")} ${pairs.length}`);
  lines.push("");

  let totalDecls = 0;
  let totalCovered = 0;

  for (const { dts, result } of pairs) {
    totalDecls += result.total;
    totalCovered += result.covered.length;
    const c = result.percent === 100 ? chalk.green : result.percent >= 50 ? chalk.yellow : chalk.red;
    const missing = result.uncovered.length
      ? chalk.dim(` \u2014 missing: ${result.uncovered.map((d) => d.name).join(", ")}`)
      : "";
    lines.push(
      `  ${c(`${result.covered.length}/${result.total}`.padStart(5))} ${c(`${String(result.percent).padStart(3)}%`)}  ${relOrAbs(dts)}${missing}`
    );
    if (verbose && result.unrecognized.length) {
      lines.push(chalk.dim(`        ${result.unrecognized.length} unrecognized assertion(s)`));
    }
  }

  if (orphans.length) {
    lines.push("");
    lines.push(chalk.yellow(`Orphan test files (no sibling .d.ts): ${orphans.length}`));
    for (const o of orphans) lines.push(`  ${chalk.yellow("!")} ${relOrAbs(o)}`);
  }

  const percent = totalDecls === 0 ? 100 : Math.round((totalCovered / totalDecls) * 100);
  const color = percent === 100 ? chalk.green : percent >= 50 ? chalk.yellow : chalk.red;
  lines.push("");
  lines.push(color(`Total: ${totalCovered}/${totalDecls} declarations covered (${percent}%)`));
  lines.push("");

  return { text: lines.join("\n"), percent, totalCovered, totalDecls };
}

module.exports = { renderReport, renderAggregateReport };
