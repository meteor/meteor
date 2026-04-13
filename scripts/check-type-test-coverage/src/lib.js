"use strict";

// Drives the TypeScript compiler over the discovered .d.ts / .test-d.ts pairs.
//
// Coverage is measured by symbol identity: the checker resolves both files
// against a *single* Program so that a type imported by the test file ends up
// with the same Symbol object as its declaration in the .d.ts. That identity
// match is what lets collectAssertions mark a declaration as "covered".
//
// A single Program for all pairs is much faster than creating one per pair —
// TypeScript's lib files (lib.es*.d.ts) only get parsed once.

const ts = require("typescript");

const { collectDeclarations } = require("./collectDeclarations");
const { collectAssertions } = require("./collectAssertions");
const { discoverPairs } = require("./files");

// Strict + noEmit: we only want the type checker, not JS output.
// types: [] prevents auto-inclusion of @types/* which would otherwise pull in
// huge global ambient declarations and slow the checker down.
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

// Turns the raw output of collectDeclarations / collectAssertions into the
// shape the report and CLI consume:
//   - covered: declarations hit by at least one assertion
//   - uncovered: declarations with no matching assertion
//   - unrecognized: assertion calls we couldn't attribute to any declaration
//   - percent / total: overall coverage for this file pair
//
// The Symbol field is stripped here — it's only useful during matching and
// would serialize to `{}` in JSON output anyway.

function computeCoverage(declarations, covered, unrecognized) {
  // Sort by source line so the report reads top-to-bottom like the .d.ts file.
  const all = Array.from(declarations.values()).sort((a, b) => a.line - b.line);
  const coveredList = [];
  const uncoveredList = [];

  for (const decl of all) {
    // Drop `symbol` — callers only need the display fields.
    const { symbol, ...rest } = decl;
    if (covered.has(symbol)) coveredList.push(rest);
    else uncoveredList.push(rest);
  }

  const total = all.length;
  // Empty .d.ts → 100%. No declarations means nothing to miss.
  const percent = total === 0 ? 100 : Math.round((coveredList.length / total) * 100);

  return {
    covered: coveredList,
    uncovered: uncoveredList,
    unrecognized: [...unrecognized].sort((a, b) => a.line - b.line),
    percent,
    total,
  };
}


// Runs coverage for one (dts, test) pair using an already-built program.
// Returns null if either source file failed to load (shouldn't happen in walk
// mode since we passed both paths as root names, but we guard anyway).
function evaluatePair(program, checker, dtsPath, testPath) {
  const dtsSource = program.getSourceFile(dtsPath);
  const testSource = program.getSourceFile(testPath);
  if (!dtsSource || !testSource) return null;

  const declarations = collectDeclarations(dtsSource, checker);
  const { covered, unrecognized } = collectAssertions(testSource, checker, declarations);
  return computeCoverage(declarations, covered, unrecognized);
}

// Walk `root`, discover pairs, then evaluate them all in a single Program.
function evaluateTypes(root) {
  const { pairs, orphans } = discoverPairs(root);
  if (pairs.length === 0) {
    return { pairs: [], orphans };
  }

  // Flatten every pair's paths into the Program root set — this is what makes
  // symbol identity work across pairs.
  const rootNames = pairs.flatMap((p) => [p.dts, p.test]);
  const program = ts.createProgram(rootNames, COMPILER_OPTIONS);
  const checker = program.getTypeChecker();

  const evaluated = [];
  for (const { dts, test } of pairs) {
    const result = evaluatePair(program, checker, dts, test);
    if (result) evaluated.push({ dts, test, result });
  }

  return { pairs: evaluated, orphans };
}

module.exports = { evaluateTypes };
