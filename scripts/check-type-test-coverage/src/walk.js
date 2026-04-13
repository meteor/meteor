"use strict";

const fs = require("fs");
const path = require("path");

const SKIP_DIRS = new Set(["node_modules", ".git", ".meteor", "dist", "build", "coverage", "coverage-ts"]);

function walkTestFiles(root) {
  const results = [];
  const stack = [path.resolve(root)];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith(".test-d.ts")) {
        results.push(full);
      }
    }
  }
  return results.sort();
}

function pairTestWithDts(testPath) {
  const sibling = testPath.slice(0, -".test-d.ts".length) + ".d.ts";
  if (fs.existsSync(sibling)) return sibling;
  return null;
}

function discoverPairs(root) {
  const tests = walkTestFiles(root);
  const pairs = [];
  const orphans = [];
  for (const t of tests) {
    const d = pairTestWithDts(t);
    if (d) pairs.push({ dts: d, test: t });
    else orphans.push(t);
  }
  return { pairs, orphans };
}

module.exports = { discoverPairs };
