#!/usr/bin/env node
"use strict";

const path = require("path");
const fs = require("fs");
const ts = require("typescript");

const { collectDeclarations } = require("./src/collectDeclarations");
const { collectAssertions } = require("./src/collectAssertions");
const { computeCoverage } = require("./src/coverage");
const { renderReport, renderAggregateReport } = require("./src/report");
const { discoverPairs } = require("./src/walk");

const HELP = `
Usage:
  check-type-test-coverage <dts> <test-d-ts> [options]       # single pair
  check-type-test-coverage --dir <path> [options]            # walk mode

Walk mode discovers every *.test-d.ts under <path>, pairs each with its
sibling *.d.ts, and reports aggregated coverage.

Options:
  --dir <path>      Walk mode: discover and evaluate every test pair under <path>
  --min <percent>   Minimum overall coverage required to pass (default: 100)
  --json            Emit machine-readable JSON instead of a human report
  --verbose         Show all unrecognized assertions / extra diagnostics
  -h, --help        Show this message

Exit code: 0 if covered >= --min, 1 otherwise.
`;

function parseArgs(argv) {
  const positional = [];
  const opts = { min: 100, json: false, verbose: false, help: false, dir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") opts.help = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--verbose") opts.verbose = true;
    else if (a === "--dir") opts.dir = argv[++i];
    else if (a === "--min") {
      const v = Number(argv[++i]);
      if (Number.isNaN(v) || v < 0 || v > 100) {
        throw new Error(`--min expects a number between 0 and 100, got ${argv[i]}`);
      }
      opts.min = v;
    } else if (a.startsWith("--")) {
      throw new Error(`Unknown flag: ${a}`);
    } else {
      positional.push(a);
    }
  }
  return { positional, opts };
}

function mustExist(label, p) {
  if (!fs.existsSync(p)) {
    throw new Error(`${label} not found: ${p}`);
  }
}

const COMPILER_OPTIONS = {
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Node10,
  strict: true,
  noEmit: true,
  skipLibCheck: true,
  types: [],
  allowJs: false,
};

function runSinglePair(dtsPath, testPath, opts) {
  const program = ts.createProgram([dtsPath, testPath], COMPILER_OPTIONS);
  const checker = program.getTypeChecker();
  const dtsSource = program.getSourceFile(dtsPath);
  const testSource = program.getSourceFile(testPath);
  if (!dtsSource) throw new Error(`TypeScript could not load ${dtsPath}`);
  if (!testSource) throw new Error(`TypeScript could not load ${testPath}`);

  const declarations = collectDeclarations(dtsSource, checker);
  const { covered, unrecognized } = collectAssertions(testSource, checker, declarations);
  return computeCoverage(declarations, covered, unrecognized);
}

function runWalkMode(root, opts) {
  const { pairs, orphans } = discoverPairs(root);
  if (pairs.length === 0) {
    return { pairs: [], orphans, percent: 100, totalCovered: 0, totalDecls: 0 };
  }

  const rootNames = pairs.flatMap((p) => [p.dts, p.test]);
  const program = ts.createProgram(rootNames, COMPILER_OPTIONS);
  const checker = program.getTypeChecker();

  const evaluated = [];
  for (const { dts, test } of pairs) {
    const dtsSource = program.getSourceFile(dts);
    const testSource = program.getSourceFile(test);
    if (!dtsSource || !testSource) continue;
    const declarations = collectDeclarations(dtsSource, checker);
    const { covered, unrecognized } = collectAssertions(testSource, checker, declarations);
    const result = computeCoverage(declarations, covered, unrecognized);
    evaluated.push({ dts, test, result });
  }

  return { pairs: evaluated, orphans };
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${e.message}\n${HELP}`);
    process.exit(2);
  }

  if (parsed.opts.help || (!parsed.opts.dir && parsed.positional.length === 0)) {
    process.stdout.write(HELP);
    process.exit(parsed.opts.help ? 0 : 2);
  }

  // Walk mode
  if (parsed.opts.dir) {
    if (parsed.positional.length > 0) {
      process.stderr.write(`--dir is exclusive with positional args.\n${HELP}`);
      process.exit(2);
    }
    const root = path.resolve(parsed.opts.dir);
    mustExist("directory", root);
    const { pairs, orphans } = runWalkMode(root, parsed.opts);

    if (parsed.opts.json) {
      const totalDecls = pairs.reduce((n, p) => n + p.result.total, 0);
      const totalCovered = pairs.reduce((n, p) => n + p.result.covered.length, 0);
      const percent = totalDecls === 0 ? 100 : Math.round((totalCovered / totalDecls) * 100);
      process.stdout.write(
        JSON.stringify(
          {
            pairs: pairs.map(({ dts, test, result }) => ({ dts, test, ...result })),
            orphans,
            percent,
            totalCovered,
            totalDecls,
          },
          null,
          2
        ) + "\n"
      );
      process.exit(percent >= parsed.opts.min ? 0 : 1);
    }

    const { text, percent } = renderAggregateReport({
      cwd: root,
      pairs,
      orphans,
      verbose: parsed.opts.verbose,
    });
    process.stdout.write(text);
    process.exit(percent >= parsed.opts.min ? 0 : 1);
  }

  // Single-pair mode
  if (parsed.positional.length !== 2) {
    process.stderr.write(
      `Expected exactly 2 positional args (<dts> <test-d-ts>) or --dir <path>, got ${parsed.positional.length}.\n${HELP}`
    );
    process.exit(2);
  }

  const [dtsArg, testArg] = parsed.positional;
  const dtsPath = path.resolve(dtsArg);
  const testPath = path.resolve(testArg);
  mustExist("declaration file", dtsPath);
  mustExist("test file", testPath);

  const result = runSinglePair(dtsPath, testPath, parsed.opts);

  if (parsed.opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          covered: result.covered,
          uncovered: result.uncovered,
          unrecognized: result.unrecognized,
          percent: result.percent,
          total: result.total,
        },
        null,
        2
      ) + "\n"
    );
  } else {
    process.stdout.write(
      renderReport({ dtsPath, testPath, result, verbose: parsed.opts.verbose })
    );
  }

  process.exit(result.percent >= parsed.opts.min ? 0 : 1);
}

main();
