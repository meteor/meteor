"use strict";

function computeCoverage(declarations, covered, unrecognized) {
  const all = Array.from(declarations.values()).sort((a, b) => a.line - b.line);
  const coveredList = [];
  const uncoveredList = [];

  for (const decl of all) {
    const { symbol, ...rest } = decl;
    if (covered.has(symbol)) coveredList.push(rest);
    else uncoveredList.push(rest);
  }

  const total = all.length;
  const percent = total === 0 ? 100 : Math.round((coveredList.length / total) * 100);

  return {
    covered: coveredList,
    uncovered: uncoveredList,
    unrecognized: [...unrecognized].sort((a, b) => a.line - b.line),
    percent,
    total,
  };
}

module.exports = { computeCoverage };
