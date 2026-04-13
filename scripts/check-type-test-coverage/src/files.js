// Filesystem discovery: find *.test-d.ts files under a root and pair each
// with its sibling *.d.ts. Pairing is purely by filename convention
// (foo.test-d.ts ↔ foo.d.ts in the same directory), no config needed.

import fs from "node:fs";

// Directories we never want to descend into — either machine-generated or
// irrelevant to coverage (node_modules would also explode the walk time).
const SKIP_DIRS = ["node_modules", ".git", ".meteor", "dist", "build", "coverage", "coverage-ts"];

// Uses Node.js native fs.globSync (stable since v22).
// Returns sorted paths so the report is deterministic.
function findTestFiles(root) {
  return fs.globSync(`${root}/**/*.test-d.ts`, {
    exclude: (p) => SKIP_DIRS.some((dir) => p.includes(`/${dir}/`) || p.endsWith(`/${dir}`)),
  }).sort();
}

// Split discovered tests into pairs (test + matching dts) and orphans (tests
// with no sibling dts — usually a config/layout mistake worth surfacing).
export function discoverPairs(root) {
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
