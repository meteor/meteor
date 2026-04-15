#!/usr/bin/env node

import path from "node:path";
import fs from "node:fs";
import { parseArgs } from "node:util";

import { evaluateTypes } from "./src/lib.js";
import { renderAggregateReport, aggregateTotals } from "./src/report.js";

const HELP = `
Usage:
  check-type-test-coverage <dir> [options]

Discovers every *.test-d.ts under <dir>, pairs each with its sibling *.d.ts,
and reports aggregated coverage.

Options:
  --min <percent>   Minimum overall coverage required to pass (default: 100)
  --json            Emit machine-readable JSON instead of a human report
  --verbose         Show all unrecognized assertions / extra diagnostics
  -h, --help        Show this message

Exit code: 0 if covered >= --min, 1 otherwise.
`;

// Print `message` + HELP to stderr and exit.
// Exit code 2 is reserved for usage errors (distinct from "coverage below --min" which uses 1).
function fail(message, code = 2) {
  process.stderr.write(`${message}\n${HELP}`);
  process.exit(code); // process.exit is acceptable here for fatal CLI usage errors
}

function emitJson(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}

async function main() {
  let values, positionals;

  try {
    const parsed = parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      options: {
        min: { type: "string", default: "100" },
        json: { type: "boolean", default: false },
        verbose: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });

    values = parsed.values;
    positionals = parsed.positionals;
  } catch (e) {
    // parseArgs automatically throws for unknown flags (e.g., --unknown)
    fail(e.message);
  }

  // No args / explicit help: print usage. Exit 0 for --help, 2 for "nothing given".
  if (values.help || positionals.length === 0) {
    process.stdout.write(HELP);
    process.exitCode = values.help ? 0 : 2;
    return;
  }

  if (positionals.length !== 1) {
    fail(`Expected exactly 1 arg (<dir>), got ${positionals.length}. Check --help for more information.`);
  }

  // Manual validation for --min since parseArgs extracts it as a string
  const minCoverage = Number(values.min);
  if (Number.isNaN(minCoverage) || minCoverage < 0 || minCoverage > 100) {
    fail(`--min expects a number between 0 and 100, got ${values.min}`);
  }

  const root = path.resolve(positionals[0]);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    fail(`Directory not found or not a directory: ${root}`);
  }

  // Walk `root`, pair each *.test-d.ts with its sibling *.d.ts, evaluate coverage.
  const { pairs, orphans } = evaluateTypes(root);

  if (values.json) {
    const { totalCovered, totalDecls, percent } = aggregateTotals(pairs);
    emitJson({
      pairs: pairs.map(({ dts, test, result }) => ({ dts, test, ...result })),
      orphans,
      percent,
      totalCovered,
      totalDecls,
    });

    process.exitCode = percent >= minCoverage ? 0 : 1;
    return;
  }

  const { text, percent } = renderAggregateReport({
    cwd: root,
    pairs,
    orphans,
    verbose: values.verbose,
  });

  process.stdout.write(text);
  // Exit 1 when coverage is below --min — lets CI gate on this threshold.
  process.exitCode = percent >= minCoverage ? 0 : 1;
}

await main();