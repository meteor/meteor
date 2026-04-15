import ts from "typescript";
import { lineOf } from "./utils.js";

const NAMED_DECLARATION_KINDS = {
  [ts.SyntaxKind.InterfaceDeclaration]: "interface",
  [ts.SyntaxKind.TypeAliasDeclaration]: "type",
  [ts.SyntaxKind.ClassDeclaration]: "class",
  [ts.SyntaxKind.FunctionDeclaration]: "function",
  [ts.SyntaxKind.EnumDeclaration]: "enum",
  [ts.SyntaxKind.ModuleDeclaration]: "namespace",
};

const RECOGNIZED_CALLEES = new Set(["expectTypeOf", "expectType"]);

function resolveAlias(checker, symbol) {
  let sym = symbol;
  while (sym && sym.flags & ts.SymbolFlags.Alias) {
    const next = checker.getAliasedSymbol(sym);
    /* node:coverage ignore next */
    if (!next || next === sym) break;
    sym = next;
  }
  return sym;
}

export function collectDeclarations(sourceFile, checker) {
  const out = new Map();
  
  const add = (sym, nameText, kind, lineNode) => {
    /* node:coverage ignore next */
    if (!sym) return;
    const resolved = resolveAlias(checker, sym);
    if (!out.has(resolved)) {
      out.set(resolved, { 
        symbol: resolved, 
        name: nameText, 
        kind, 
        line: lineOf(sourceFile, lineNode) 
      });
    }
  };

  const processStatements = (statements) => {
    for (const stmt of statements) {
      if (ts.isExportDeclaration(stmt)) {
        if (stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
          for (const el of stmt.exportClause.elements) {
            add(checker.getSymbolAtLocation(el.name), el.name.getText(sourceFile), "re-export", el);
          }
        }
      } else if (ts.isExportAssignment(stmt)) {
        add(checker.getSymbolAtLocation(stmt.expression), stmt.expression.getText(sourceFile), "default", stmt);
      } else if ((ts.getCombinedModifierFlags(stmt) & ts.ModifierFlags.Export) !== 0) {
        if (ts.isVariableStatement(stmt)) {
          for (const decl of stmt.declarationList.declarations) {
            if (ts.isIdentifier(decl.name)) {
              add(checker.getSymbolAtLocation(decl.name), decl.name.getText(sourceFile), "const", stmt);
            }
          }
        } else {
          const kind = NAMED_DECLARATION_KINDS[stmt.kind];
          if (kind && stmt.name && ts.isIdentifier(stmt.name)) {
            add(checker.getSymbolAtLocation(stmt.name), stmt.name.getText(sourceFile), kind, stmt);
          }
          if (stmt.kind === ts.SyntaxKind.ModuleDeclaration && stmt.body) {
            if (stmt.body.statements) {
              processStatements(stmt.body.statements);
            } else if (stmt.body.kind === ts.SyntaxKind.ModuleDeclaration) {
              processStatements([stmt.body]);
            }
          }
        }
      }
    }
  };

  processStatements(sourceFile.statements);

  return out;
}

function resolveCandidateSymbols(checker, typeArg, valueArg) {
  const symbols = [];
  
  const addFromType = (type) => {
    /* node:coverage ignore next */
    if (!type) return;
    if (type.aliasSymbol) symbols.push(type.aliasSymbol);
    const s = type.getSymbol();
    if (s) symbols.push(s);
  };

  if (typeArg) {
    if (!ts.isTypeReferenceNode(typeArg)) {
      addFromType(checker.getTypeFromTypeNode(typeArg));
    } else {
      const nameNode = ts.isIdentifier(typeArg.typeName) ? typeArg.typeName : typeArg.typeName.right;
      const fullSym = checker.getSymbolAtLocation(nameNode);
      if (fullSym) symbols.push(fullSym);

      let leftmost = typeArg.typeName;
      while (leftmost && !ts.isIdentifier(leftmost)) {
        if (ts.isQualifiedName(leftmost)) leftmost = leftmost.left;
        else if (ts.isPropertyAccessExpression(leftmost)) leftmost = leftmost.expression;
        else { leftmost = null; break; }
      }
      if (leftmost) {
         const leftSym = checker.getSymbolAtLocation(leftmost);
         if (leftSym) symbols.push(leftSym);
      }
    }
  }

  if (valueArg) {
    addFromType(checker.getTypeAtLocation(valueArg));
    if (ts.isIdentifier(valueArg)) {
      const s = checker.getSymbolAtLocation(valueArg);
      if (s) symbols.push(s);
    }
  }

  return symbols.map(s => resolveAlias(checker, s)).filter(Boolean);
}

export function collectAssertions(sourceFile, checker, declarationSymbols) {
  const covered = new Set();
  const unrecognized = [];

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      let calleeName = null;
      if (ts.isIdentifier(node.expression)) {
        calleeName = node.expression.text;
      } else if (ts.isPropertyAccessExpression(node.expression) && ts.isIdentifier(node.expression.name)) {
        calleeName = node.expression.name.text;
      }

      if (calleeName && RECOGNIZED_CALLEES.has(calleeName)) {
        const syms = resolveCandidateSymbols(checker, node.typeArguments?.[0], node.arguments?.[0]);
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
