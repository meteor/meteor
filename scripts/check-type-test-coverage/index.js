#!/usr/bin/env node
"use strict";

// Entrypoint for the `check-type-test-coverage` CLI.
// Responsibilities:
//   - parse process.argv into a structured { args, opts } object
//   - validate required inputs (existing directory, single positional arg)
//   - dispatch to the runner (walk mode) and format the output (human or JSON)
//   - translate the overall coverage percentage into a process exit code
//
// Keeping orchestration here means runner.js / report.js stay pure and reusable.

const path = require("path");
const fs = require("fs");

const { evaluateTypes } = require("./src/lib");
const { renderAggregateReport, aggregateTotals } = require("./src/report");

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

function parseArgs(argv) {
  const args = [];
  const opts = { min: 100, json: false, verbose: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--verbose") opts.verbose = true;
    else if (a === "--min") {
      // --min consumes the next argv entry as its value.
      const raw = argv[++i];
      const v = Number(raw);
      if (Number.isNaN(v) || v < 0 || v > 100) {
        throw new Error(`--min expects a number between 0 and 100, got ${raw}`);
      }
      opts.min = v;
    } else if (a.startsWith("--")) {
      // Unknown long flag — fail fast so typos don't silently become positionals.
      throw new Error(`Unknown flag: ${a}`);
    } else {
      args.push(a);
    }
  }
  return { args, opts };
}

function mustExist(label, p) {
  if (!fs.existsSync(p)) throw new Error(`${label} not found: ${p}`);
}

// Print `message` + HELP to stderr and exit.
// Exit code 2 is reserved for usage errors (distinct from "coverage below --min" which uses 1).
function fail(message, code = 2) {
  process.stderr.write(`${message}\n${HELP}`);
  process.exit(code);
}

function emitJson(payload) {
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (e) {
    fail(e.message);
  }

  const { opts, args } = parsed;

  // No args / explicit help: print usage. Exit 0 for --help, 2 for "nothing given".
  if (opts.help || args.length === 0) {
    process.stdout.write(HELP);
    process.exit(opts.help ? 0 : 2);
  }

  if (args.length !== 1) {
    fail(`Expected exactly 1 arg (<dir>), got ${args.length}. Check --help for more information.`);
  }

  const root = path.resolve(args[0]);
  mustExist("directory", root);

  // Walk `root`, pair each *.test-d.ts with its sibling *.d.ts, evaluate coverage.
  const { pairs, orphans } = evaluateTypes(root);

  if (opts.json) {
    const { totalCovered, totalDecls, percent } = aggregateTotals(pairs);
    emitJson({
      pairs: pairs.map(({ dts, test, result }) => ({ dts, test, ...result })),
      orphans,
      percent,
      totalCovered,
      totalDecls,
    });
    process.exit(percent >= opts.min ? 0 : 1);
  }

  const { text, percent } = renderAggregateReport({
    cwd: root,
    pairs,
    orphans,
    verbose: opts.verbose,
  });
  process.stdout.write(text);
  // Exit 1 when coverage is below --min — lets CI gate on this threshold.
  process.exit(percent >= opts.min ? 0 : 1);
}


main(process.argv.slice(2));

