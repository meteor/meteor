#!/usr/bin/env node
/**
 * Type-breadth gate — measures how many user-facing packages ship typings.
 *
 * Unlike `type-coverage` (which measures the QUALITY of existing .ts/.d.ts and
 * is blind to packages with no types at all), this is package-driven: it
 * starts from the curated manifest and asserts every "needsTypes" package
 * ships a .d.ts.
 *
 * Manifest: scripts/type-coverage/packages-manifest.json
 *   - needsTypes: packages a dev imports from, or that augment a shared public
 *                 surface (e.g. accounts-password augmenting `meteor/meteor`).
 *   - waived:     internal/build/test/deprecated packages, each with a reason.
 * DEFAULT-DENY: any package not listed in either bucket is UNCLASSIFIED and
 * fails, so a newly-added package must be typed or explicitly waived.
 *
 * Usage:
 *   node scripts/type-coverage/check-type-breadth.js           # report only
 *   node scripts/type-coverage/check-type-breadth.js --strict  # blocking gate
 */
"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_ROOT = path.resolve(__dirname, "..", "..");
const DEFAULT_MANIFEST = path.join(__dirname, "packages-manifest.json");

function submodulePaths(root) {
  const gitmodules = path.join(root, ".gitmodules");
  if (!fs.existsSync(gitmodules)) return new Set();

  const paths = new Set();
  const pattern = /^\s*path\s*=\s*(.+?)\s*$/gm;
  const contents = fs.readFileSync(gitmodules, "utf8");
  let match;
  while ((match = pattern.exec(contents))) {
    paths.add(path.resolve(root, match[1]));
  }
  return paths;
}

function findPackageDirs(dir, { submodules, acc = [] }) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (["node_modules", ".npm", ".git"].includes(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (submodules.has(path.resolve(fullPath))) continue;
    if (fs.existsSync(path.join(fullPath, "package.js"))) acc.push(fullPath);
    findPackageDirs(fullPath, { submodules, acc });
  }
  return acc;
}

function hasDts(dir) {
  let found = false;
  const walk = (currentDir, depth) => {
    if (found || depth > 2) return;
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      if (["node_modules", ".npm"].includes(entry.name)) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (entry.name.endsWith(".d.ts")) {
        found = true;
        return;
      }
    }
  };
  walk(dir, 0);
  return found;
}

function analyzeTypeBreadth({
  root = DEFAULT_ROOT,
  packagesDir = path.join(root, "packages"),
  manifestPath = DEFAULT_MANIFEST,
} = {}) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const needsTypes = new Set(manifest.needsTypes || []);
  const waivedByPackage = manifest.waived || {};
  const submodules = submodulePaths(root);
  const packageKeys = findPackageDirs(packagesDir, { submodules })
    .map((dir) => path.relative(packagesDir, dir))
    .sort();

  const typed = [];
  const missing = [];
  const unclassified = [];

  for (const key of packageKeys) {
    if (Object.prototype.hasOwnProperty.call(waivedByPackage, key)) continue;
    if (needsTypes.has(key)) {
      (hasDts(path.join(packagesDir, key)) ? typed : missing).push(key);
    } else {
      unclassified.push(key);
    }
  }

  const requiredCount = typed.length + missing.length;
  const percentage = requiredCount ? Math.round((typed.length / requiredCount) * 100) : 100;

  return {
    packageKeys,
    typed,
    missing,
    unclassified,
    waived: Object.keys(waivedByPackage),
    requiredCount,
    percentage,
  };
}

function formatTypeBreadthReport(analysis) {
  const lines = [
    "Type-breadth (packages that need types):",
    `  Typed:   ${analysis.typed.length}/${analysis.requiredCount} (${analysis.percentage}%)`,
    `  Waived:  ${analysis.waived.length}`,
    `  Total packages: ${analysis.packageKeys.length}`,
  ];

  if (analysis.missing.length) {
    lines.push("", `MISSING types (${analysis.missing.length}):`);
    analysis.missing.forEach((key) => lines.push(`  - ${key}`));
  }
  if (analysis.unclassified.length) {
    lines.push(
      "",
      "UNCLASSIFIED — not in manifest, classify as needsTypes or waived " +
        `(${analysis.unclassified.length}):`,
    );
    analysis.unclassified.forEach((key) => lines.push(`  - ${key}`));
  }

  return lines.join("\n");
}

function runTypeBreadth({
  root = DEFAULT_ROOT,
  packagesDir = path.join(root, "packages"),
  manifestPath = DEFAULT_MANIFEST,
  strict = false,
  logger = console,
} = {}) {
  const analysis = analyzeTypeBreadth({ root, packagesDir, manifestPath });
  logger.log(formatTypeBreadthReport(analysis));

  const failed = strict && (analysis.missing.length > 0 || analysis.unclassified.length > 0);
  if (failed) {
    logger.error(
      `\n✖ type-breadth failed: ${analysis.missing.length} missing, ` +
        `${analysis.unclassified.length} unclassified.`,
    );
  } else {
    logger.log(`\n✔ report complete${strict ? " (strict: passed)" : ""}.`);
  }

  return { analysis, exitCode: failed ? 1 : 0 };
}

if (require.main === module) {
  const result = runTypeBreadth({ strict: process.argv.includes("--strict") });
  process.exitCode = result.exitCode;
}

module.exports = {
  analyzeTypeBreadth,
  findPackageDirs,
  formatTypeBreadthReport,
  hasDts,
  runTypeBreadth,
  submodulePaths,
};
