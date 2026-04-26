import { Minimongo } from 'meteor/minimongo';
import { parseSelector } from './parse-selector';
import { astToRawSelector } from './round-trip';
import { isAST } from './ast';

const compiledMatcherCache = new WeakMap();

/**
 * Test whether a document matches a selector.
 *
 * Accepts either a raw MongoDB-style selector or a pre-parsed SelectorAST.
 * Adapters that filter in JS after fetch should pre-parse the AST once and
 * pass it to repeated `match` calls — the compiled matcher is cached per
 * AST instance via WeakMap.
 *
 * Internally delegates to `Minimongo.Matcher` after round-tripping the AST
 * back to raw form. This is a deliberate, durable choice — see the design
 * doc Section 4.
 */
export function match(doc, input) {
  const ast = isAST(input) ? input : parseSelector(input);
  let compiled = compiledMatcherCache.get(ast);
  if (!compiled) {
    compiled = new Minimongo.Matcher(astToRawSelector(ast));
    compiledMatcherCache.set(ast, compiled);
  }
  return compiled.documentMatches(doc).result;
}
