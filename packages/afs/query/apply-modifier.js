import { LocalCollection } from 'meteor/minimongo';
import { parseModifier } from './parse-modifier';
import { astToRawModifier } from './round-trip';
import { isAST } from './ast';

/**
 * Apply a MongoDB-style modifier to a document, in place.
 *
 * Accepts either a raw modifier or a pre-parsed ModifierAST. Replacement
 * documents are routed through `_modify` directly; operator programs are
 * round-tripped from the AST back to raw form before delegation.
 *
 * `options` mirrors `LocalCollection._modify`:
 *   { isInsert: false, arrayIndices: undefined, forbidArrayInsertion: false }
 */
export function applyModifier(doc, input, options) {
  const ast = isAST(input) ? input : parseModifier(input);
  const raw = ast.isReplacement ? ast.replacement : astToRawModifier(ast);
  return LocalCollection._modify(doc, raw, options);
}
