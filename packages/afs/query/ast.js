/**
 * AST node-type and predicate-kind constants.
 *
 * Plain string values — chosen so AST objects round-trip cleanly through
 * EJSON (cursor descriptions, multiplexer cache keys) without a custom
 * type registry.
 *
 * Adapter walkers may switch on these values directly; the constants
 * exist so a typo at a callsite becomes a `ReferenceError` rather than a
 * silently-missed branch.
 */
export const AST = Object.freeze({
  // Selector top-level node types
  AND:        'And',
  OR:         'Or',
  NOR:        'Nor',
  NOT:        'Not',
  FIELD:      'Field',
  WHERE:      'Where',
  EXPR:       'Expr',
  GEO:        'Geo',
  TEXT:       'Text',

  // Modifier top-level
  MODIFIER_PROGRAM: 'ModifierProgram',

  // Sort / Projection top-level
  SORT:       'Sort',
  PROJECTION: 'Projection',
});

/**
 * Predicate kinds (the `kind` field on Field-node predicates).
 */
export const PRED = Object.freeze({
  EQ:        'Eq',
  NE:        'Ne',
  GT:        'Gt',
  GTE:       'Gte',
  LT:        'Lt',
  LTE:       'Lte',
  IN:        'In',
  NIN:       'Nin',
  EXISTS:    'Exists',
  TYPE:      'Type',
  REGEX:     'Regex',
  MOD:       'Mod',
  SIZE:      'Size',
  ALL:       'All',
  ELEM_MATCH:'ElemMatch',
  BITS:      'Bits',
});

/**
 * Modifier-op kinds.
 */
export const MOD = Object.freeze({
  SET:           'Set',
  SET_ON_INSERT: 'SetOnInsert',
  UNSET:         'Unset',
  INC:           'Inc',
  MUL:           'Mul',
  MIN:           'Min',
  MAX:           'Max',
  RENAME:        'Rename',
  CURRENT_DATE:  'CurrentDate',
  PUSH:          'Push',
  POP:           'Pop',
  PULL:          'Pull',
  PULL_ALL:      'PullAll',
  ADD_TO_SET:    'AddToSet',
  BIT:           'Bit',
});

/**
 * Cheap AST-instance check used by `parseSelector` / `parseModifier` /
 * `match` / `applyModifier` for idempotence: if the input already has a
 * recognized `type` field, treat it as already-parsed.
 */
const KNOWN_TYPES = new Set(Object.values(AST));
export function isAST(value) {
  return value !== null
    && typeof value === 'object'
    && typeof value.type === 'string'
    && KNOWN_TYPES.has(value.type);
}
