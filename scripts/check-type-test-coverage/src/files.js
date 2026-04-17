// Filesystem discovery: find *.d.ts and *.test-d.ts files under a root and
// pair each test with its sibling *.d.ts. Pairing is purely by filename
// convention (foo.test-d.ts ↔ foo.d.ts in the same directory), no config
// needed. Declaration files without a matching test are reported as untested
// so they contribute 0% to the overall coverage.
import path from "node:path";
import fs from "node:fs";

// Directories we never want to descend into — either machine-generated or
// irrelevant to coverage (node_modules would also explode the walk time).
const SKIP_DIRS = ["node_modules", ".git", ".meteor", "dist", "build", "coverage", "coverage-ts"];

function excludeSkipped(p) {
  return path.normalize(p).split(path.sep).some((part) => SKIP_DIRS.includes(part));
}

// Uses Node.js native fs.globSync (stable since v22).
// Returns sorted paths so the report is deterministic.
function findTestFiles(root) {
  return fs.globSync("**/*.test-d.ts", {
    cwd: root,
    exclude: excludeSkipped,
  }).map((p) => path.join(root, p)).sort();
}

// Find every *.d.ts under `root`, excluding the *.test-d.ts files themselves.
function findDtsFiles(root) {
  return fs.globSync("**/*.d.ts", {
    cwd: root,
    exclude: (p) => excludeSkipped(p) || p.endsWith(".test-d.ts"),
  }).map((p) => path.join(root, p)).sort();
}

// Split discovered files into:
//   - pairs: test + matching dts
//   - orphans: tests with no sibling dts (usually a layout mistake)
//   - untested: dts with no sibling test (counted as 0% in the report)
export function discoverPairs(root) {
  const tests = findTestFiles(root);
  const dtsFiles = findDtsFiles(root);
  const dtsSet = new Set(dtsFiles);
  const testedDts = new Set();

  const pairs = [];
  const orphans = [];
  for (const t of tests) {
    const dtsFile = t.slice(0, -".test-d.ts".length) + ".d.ts";
    if (dtsSet.has(dtsFile)) {
      pairs.push({ dts: dtsFile, test: t });
      testedDts.add(dtsFile);
    } else {
      orphans.push(t);
    }
  }

  const untested = dtsFiles.filter((d) => !testedDts.has(d));
  return { pairs, orphans, untested };
}
