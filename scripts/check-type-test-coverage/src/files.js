"use strict";

// Filesystem discovery: find *.test-d.ts files under a root and pair each
// with its sibling *.d.ts. Pairing is purely by filename convention
// (foo.test-d.ts ↔ foo.d.ts in the same directory), no config needed.

const fs = require("fs");
const { globSync } = require('node:fs');

// Directories we never want to descend into — either machine-generated or
// irrelevant to coverage (node_modules would also explode the walk time).
const SKIP_DIRS = new Set(["node_modules", ".git", ".meteor", "dist", "build", "coverage", "coverage-ts"]);

// Iterative DFS (instead of recursion) to keep the stack bounded on deep trees.
// Returns sorted paths so the report is deterministic.
function findTestFiles(root) {
  return globSync(`${root}/**/*.test-d.ts`, {
    ignore: Array.from(SKIP_DIRS).map(dir => `**/${dir}/**`),
    nodir: true,
    absolute: true
  }).sort();
}

// Split discovered tests into pairs (test + matching dts) and orphans (tests
// with no sibling dts — usually a config/layout mistake worth surfacing).
function discoverPairs(root) {
  const tests = findTestFiles(root);
  const pairs = [];
  const orphans = [];
  for (const t of tests) {
    const dtsFile = t.slice(0, -".test-d.ts".length) + ".d.ts";
    if (fs.existsSync(dtsFile)) pairs.push({ dts: dtsFile, test: t });
    else orphans.push(t);
  }
  return { pairs, orphans };
}

module.exports = { discoverPairs };
