"use strict";

const ts = require("typescript");

const KIND_LABEL = {
  [ts.SyntaxKind.InterfaceDeclaration]: "interface",
  [ts.SyntaxKind.TypeAliasDeclaration]: "type",
  [ts.SyntaxKind.ClassDeclaration]: "class",
  [ts.SyntaxKind.FunctionDeclaration]: "function",
  [ts.SyntaxKind.EnumDeclaration]: "enum",
  [ts.SyntaxKind.ModuleDeclaration]: "namespace",
  [ts.SyntaxKind.VariableStatement]: "const",
};

function resolveAlias(checker, symbol) {
  let sym = symbol;
  while (sym && sym.flags & ts.SymbolFlags.Alias) {
    const next = checker.getAliasedSymbol(sym);
    if (!next || next === sym) break;
    sym = next;
  }
  return sym;
}

function hasExportModifier(node) {
  const flags = ts.getCombinedModifierFlags(node);
  return (flags & ts.ModifierFlags.Export) !== 0;
}

function lineOf(sourceFile, node) {
  const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return line + 1;
}

function record(checker, sourceFile, nameNode, kind, declNode) {
  const symbol = checker.getSymbolAtLocation(nameNode);
  if (!symbol) return null;
  const resolved = resolveAlias(checker, symbol);
  return {
    symbol: resolved,
    name: nameNode.getText(sourceFile),
    kind,
    line: lineOf(sourceFile, declNode),
  };
}

function collectDeclarations(sourceFile, checker) {
  const out = new Map();
  const add = (rec) => {
    if (!rec) return;
    if (!out.has(rec.symbol)) out.set(rec.symbol, rec);
  };

  for (const stmt of sourceFile.statements) {
    if (ts.isExportDeclaration(stmt)) {
      const clause = stmt.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        for (const el of clause.elements) {
          add(record(checker, sourceFile, el.name, "re-export", el));
        }
      }
      continue;
    }

    if (ts.isExportAssignment(stmt)) {
      const sym = checker.getSymbolAtLocation(stmt.expression);
      if (sym) {
        add({
          symbol: resolveAlias(checker, sym),
          name: stmt.expression.getText(sourceFile),
          kind: "default",
          line: lineOf(sourceFile, stmt),
        });
      }
      continue;
    }

    if (!hasExportModifier(stmt)) continue;

    const kind = KIND_LABEL[stmt.kind];

    if (ts.isVariableStatement(stmt)) {
      for (const decl of stmt.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          add(record(checker, sourceFile, decl.name, "const", stmt));
        }
      }
      continue;
    }

    if (
      (ts.isInterfaceDeclaration(stmt) ||
        ts.isTypeAliasDeclaration(stmt) ||
        ts.isClassDeclaration(stmt) ||
        ts.isFunctionDeclaration(stmt) ||
        ts.isEnumDeclaration(stmt) ||
        ts.isModuleDeclaration(stmt)) &&
      stmt.name &&
      ts.isIdentifier(stmt.name)
    ) {
      add(record(checker, sourceFile, stmt.name, kind, stmt));
    }
  }

  return out;
}

module.exports = { collectDeclarations, resolveAlias };
