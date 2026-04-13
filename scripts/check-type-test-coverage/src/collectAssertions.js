"use strict";

const ts = require("typescript");
const { resolveAlias } = require("./collectDeclarations");

const RECOGNIZED_CALLEES = new Set(["expectTypeOf", "expectType"]);

function leftmostIdentifier(node) {
  let cur = node;
  while (cur) {
    if (ts.isIdentifier(cur)) return cur;
    if (ts.isQualifiedName(cur)) cur = cur.left;
    else if (ts.isPropertyAccessExpression(cur)) cur = cur.expression;
    else return null;
  }
  return null;
}

function lineOf(sourceFile, node) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1;
}

function resolveCandidateSymbols(checker, call) {
  const symbols = [];

  const typeArg = call.typeArguments && call.typeArguments[0];
  if (typeArg) {
    if (ts.isTypeReferenceNode(typeArg)) {
      const fullSym = checker.getSymbolAtLocation(
        ts.isIdentifier(typeArg.typeName) ? typeArg.typeName : typeArg.typeName.right
      );
      if (fullSym) symbols.push(fullSym);

      const leftmost = leftmostIdentifier(typeArg.typeName);
      if (leftmost) {
        const leftSym = checker.getSymbolAtLocation(leftmost);
        if (leftSym) symbols.push(leftSym);
      }
    } else {
      const t = checker.getTypeFromTypeNode(typeArg);
      if (t) {
        if (t.aliasSymbol) symbols.push(t.aliasSymbol);
        const s = t.getSymbol();
        if (s) symbols.push(s);
      }
    }
  }

  const valueArg = call.arguments && call.arguments[0];
  if (valueArg) {
    const t = checker.getTypeAtLocation(valueArg);
    if (t) {
      if (t.aliasSymbol) symbols.push(t.aliasSymbol);
      const s = t.getSymbol();
      if (s) symbols.push(s);
    }
    if (ts.isIdentifier(valueArg)) {
      const s = checker.getSymbolAtLocation(valueArg);
      if (s) symbols.push(s);
    }
  }

  return symbols.map((s) => resolveAlias(checker, s)).filter(Boolean);
}

function collectAssertions(sourceFile, checker, declarationSymbols) {
  const covered = new Set();
  const unrecognized = [];

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)
        ? callee.expression.text
        : null;

      if (name && RECOGNIZED_CALLEES.has(name)) {
        const syms = resolveCandidateSymbols(checker, node);
        let matched = false;
        for (const s of syms) {
          if (declarationSymbols.has(s)) {
            covered.add(s);
            matched = true;
          }
        }
        if (!matched) {
          unrecognized.push({
            line: lineOf(sourceFile, node),
            text: node.getText(sourceFile).slice(0, 120),
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return { covered, unrecognized };
}

module.exports = { collectAssertions };
