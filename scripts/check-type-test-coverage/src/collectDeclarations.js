"use strict";

// Walks a .d.ts SourceFile and returns the set of exported declarations that
// should be covered by type tests. The output is a Map keyed by Symbol (not
// by name) because collectAssertions later matches via Symbol identity — names
// alone would produce false positives for re-exports and shadowing.
//
// Each entry carries a display-friendly { name, kind, line } used by the report.

const ts = require("typescript");
const { lineOf } = require("./utils");

// Only declarations carrying a Symbol with a user-visible name land here.
// VariableStatement is handled separately because its name lives on inner
// VariableDeclaration nodes, not on the statement itself.
const NAMED_DECLARATION_KINDS = {
  [ts.SyntaxKind.InterfaceDeclaration]: "interface",
  [ts.SyntaxKind.TypeAliasDeclaration]: "type",
  [ts.SyntaxKind.ClassDeclaration]: "class",
  [ts.SyntaxKind.FunctionDeclaration]: "function",
  [ts.SyntaxKind.EnumDeclaration]: "enum",
  [ts.SyntaxKind.ModuleDeclaration]: "namespace",
};

// Follow import/re-export aliases down to the "real" symbol.
// Example: `export { Foo } from "./foo"` yields an alias symbol; we want the
// underlying declaration symbol so that the test file's `expectTypeOf<Foo>()`
// resolves to the same Symbol as the declaration site.
function resolveAlias(checker, symbol) {
  let sym = symbol;
  while (sym && sym.flags & ts.SymbolFlags.Alias) {
    const next = checker.getAliasedSymbol(sym);
    // `next === sym` guards against pathological self-aliasing (shouldn't happen,
    // but bail just in case so we don't loop forever).
    if (!next || next === sym) break;
    sym = next;
  }
  return sym;
}

// True if the statement has an `export` modifier (top-level `export class Foo`
// or `export function foo`). Does not cover `export { ... }` / `export default`
// — those are handled in dedicated branches below.
function hasExportModifier(node) {
  const flags = ts.getCombinedModifierFlags(node);
  return (flags & ts.ModifierFlags.Export) !== 0;
}

// Build one declaration record keyed by its resolved symbol.
function record(checker, sourceFile, nameNode, kind, declNode) {
  const symbol = checker.getSymbolAtLocation(nameNode);
  if (!symbol) return null;
  return {
    symbol: resolveAlias(checker, symbol),
    name: nameNode.getText(sourceFile),
    kind,
    line: lineOf(sourceFile, declNode),
  };
}

// `export { Foo, Bar }` / `export { Foo as Baz } from "./x"`.
// Skips `export * from` (no clause) and type-only export specifiers we can't resolve.
function collectFromExportDeclaration(stmt, checker, sourceFile, add) {
  const clause = stmt.exportClause;
  if (!clause || !ts.isNamedExports(clause)) return;
  for (const el of clause.elements) {
    add(record(checker, sourceFile, el.name, "re-export", el));
  }
}

// `export default SomeIdentifier`. We name it after the expression text (the
// identifier) so the user sees something meaningful in the report.
function collectFromExportAssignment(stmt, checker, sourceFile, add) {
  const sym = checker.getSymbolAtLocation(stmt.expression);
  if (!sym) return;
  add({
    symbol: resolveAlias(checker, sym),
    name: stmt.expression.getText(sourceFile),
    kind: "default",
    line: lineOf(sourceFile, stmt),
  });
}

// `export const a = ..., b = ...` — iterate each declarator.
// Destructuring patterns are intentionally skipped (rare in .d.ts).
function collectFromVariableStatement(stmt, checker, sourceFile, add) {
  for (const decl of stmt.declarationList.declarations) {
    if (ts.isIdentifier(decl.name)) {
      add(record(checker, sourceFile, decl.name, "const", stmt));
    }
  }
}

// `export interface Foo`, `export class Bar`, etc. — single-named declarations.
function collectFromNamedDeclaration(stmt, checker, sourceFile, add) {
  const kind = NAMED_DECLARATION_KINDS[stmt.kind];
  if (!kind || !stmt.name || !ts.isIdentifier(stmt.name)) return;
  add(record(checker, sourceFile, stmt.name, kind, stmt));
}

// Only considers top-level statements — nested exports inside namespaces are
// not surfaced as coverable declarations (would explode the report and be
// unusual in published .d.ts files).
function collectDeclarations(sourceFile, checker) {
  const out = new Map();
  // De-dupe by symbol — re-exports and default exports may point at a symbol
  // already captured via its original declaration site.
  const add = (rec) => {
    if (rec && !out.has(rec.symbol)) out.set(rec.symbol, rec);
  };

  for (const stmt of sourceFile.statements) {
    if (ts.isExportDeclaration(stmt)) {
      collectFromExportDeclaration(stmt, checker, sourceFile, add);
      continue;
    }
    if (ts.isExportAssignment(stmt)) {
      collectFromExportAssignment(stmt, checker, sourceFile, add);
      continue;
    }
    // Everything below requires an explicit `export` modifier.
    if (!hasExportModifier(stmt)) continue;

    if (ts.isVariableStatement(stmt)) {
      collectFromVariableStatement(stmt, checker, sourceFile, add);
      continue;
    }
    collectFromNamedDeclaration(stmt, checker, sourceFile, add);
  }

  return out;
}

// resolveAlias is re-exported so collectAssertions can normalize symbols
// coming from the test file the same way.
module.exports = { collectDeclarations, resolveAlias };
