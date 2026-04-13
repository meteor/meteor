"use strict";

// Small, stateless helpers shared across modules. Kept here so callers don't
// reach into each other just for trivial formatting.

const path = require("path");
const chalk = require("chalk");

// Convert a TS AST node's start position into a 1-based line number,
// matching the format users expect in editor diagnostics and reports.
function lineOf(sourceFile, node) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1;
}

// Display a path relative to cwd when it's inside the tree, otherwise keep
// the absolute form. Prevents ugly "../../.." prefixes for files outside the
// working directory.
function relOrAbs(p) {
  const rel = path.relative(process.cwd(), p);
  return rel.startsWith("..") ? p : rel;
}

// Centralized color thresholds so every line of the report uses the same
// rules: 100% = green, >=50% = yellow, below that = red.
function colorForPercent(percent) {
  if (percent === 100) return chalk.green;
  if (percent >= 50) return chalk.yellow;
  return chalk.red;
}

module.exports = { lineOf, relOrAbs, colorForPercent };
