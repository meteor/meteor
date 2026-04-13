// Walks a *.test-d.ts SourceFile looking for tsd-style assertion calls
// (`expectTypeOf<Foo>()`, `expectType<Foo>(value)`, chained `.toEqualTypeOf(...)`,
// etc.) and marks the corresponding declaration symbols as covered.
//
// The matching is structural: we extract *candidate* symbols from the call's
// type argument and/or value argument, resolve any aliases, then intersect
// against the Map returned by collectDeclarations. If nothing intersects the
// call is recorded under `unrecognized` so the user can see what we missed.

import ts from "typescript";
import { resolveAlias } from "./collectDeclarations.js";
import { lineOf } from "./utils.js";

// The only tsd-like helpers we recognize. Adding more (e.g. `assertType`)
// would mean adding them here — no other change needed.
const RECOGNIZED_CALLEES = new Set(["expectTypeOf", "expectType"]);

// For a TypeReferenceNode like `ns.SubNs.Foo`, return the leftmost identifier
// (`ns`). We try to resolve it as a secondary candidate because a top-level
// namespace import may be what ultimately points at the declaration symbol.
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

// Returns the textual name of the function being called, unwrapping one level
// of property access (`foo.expectTypeOf(...)` → "foo", not "expectTypeOf").
// The property-access branch is deliberately conservative: we only care about
// the receiver identifier, which is what users import as `expectTypeOf`.
function getCalleeName(callee) {
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression)) {
    return callee.expression.text;
  }
  return null;
}

// Extract Symbol candidates from a resolved Type: prefer the alias symbol
// (`type Foo = Bar` keeps Foo), fall back to the regular symbol (interfaces,
// classes). Both can be present at once.
function symbolsFromType(checker, type) {
  const out = [];
  if (!type) return out;
  if (type.aliasSymbol) out.push(type.aliasSymbol);
  const s = type.getSymbol();
  if (s) out.push(s);
  return out;
}

// Symbols coming from the call's type argument: `expectTypeOf<Foo>()`.
// For a TypeReferenceNode we resolve both the *full* reference (e.g. `ns.Foo`)
// and the leftmost identifier, since either may be the covered declaration.
function symbolsFromTypeArg(checker, typeArg) {
  if (!typeArg) return [];
  if (!ts.isTypeReferenceNode(typeArg)) {
    // Non-reference type nodes (literals, unions, etc.) — fall back to the
    // checker's type resolution only.
    return symbolsFromType(checker, checker.getTypeFromTypeNode(typeArg));
  }

  const out = [];
  // For qualified names (`a.b.c`) the "name" we care about is the rightmost.
  const nameNode = ts.isIdentifier(typeArg.typeName)
    ? typeArg.typeName
    : typeArg.typeName.right;
  const fullSym = checker.getSymbolAtLocation(nameNode);
  if (fullSym) out.push(fullSym);

  const leftmost = leftmostIdentifier(typeArg.typeName);
  if (leftmost) {
    const leftSym = checker.getSymbolAtLocation(leftmost);
    if (leftSym) out.push(leftSym);
  }
  return out;
}

// Symbols coming from the call's value argument: `expectType<Foo>(value)`.
// Resolves the expression's type plus, when the argument is a bare identifier,
// the identifier's symbol itself (covers `export const x: T` where the const
// is the declaration being asserted on).
function symbolsFromValueArg(checker, valueArg) {
  if (!valueArg) return [];
  const out = symbolsFromType(checker, checker.getTypeAtLocation(valueArg));
  if (ts.isIdentifier(valueArg)) {
    const s = checker.getSymbolAtLocation(valueArg);
    if (s) out.push(s);
  }
  return out;
}

// Union of all Symbol candidates for a single call, de-aliased and filtered.
function resolveCandidateSymbols(checker, call) {
  const typeArg = call.typeArguments?.[0];
  const valueArg = call.arguments?.[0];
  const symbols = [
    ...symbolsFromTypeArg(checker, typeArg),
    ...symbolsFromValueArg(checker, valueArg),
  ];
  return symbols.map((s) => resolveAlias(checker, s)).filter(Boolean);
}

// Traverse every node in the test source; on each recognized call, try to
// match its candidates against `declarationSymbols`. A single call can cover
// multiple declarations (e.g. via a qualified name), so we don't `break`
// after the first match.
export function collectAssertions(sourceFile, checker, declarationSymbols) {
  const covered = new Set();
  const unrecognized = [];

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const name = getCalleeName(node.expression);
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
          // Record unmatched calls so --verbose can surface them. The text is
          // truncated at 120 chars to keep reports readable.
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
