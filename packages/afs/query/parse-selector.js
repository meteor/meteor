import { AST, PRED, isAST } from './ast';
import { ParseError } from './errors';
import { pathFromDotted, pathToDotted } from './paths';

/**
 * Parse a raw MongoDB-style selector into a normalized SelectorAST.
 *
 * Idempotent: returns the input unchanged when the input is already a
 * recognized AST node.
 *
 * @param {*} raw - Raw selector or pre-parsed SelectorAST.
 * @param {Object} [opts]
 * @param {boolean} [opts.isUpdate] - Mirrors minimongo's Matcher
 *   constructor flag for update-context selector quirks ($near in update).
 * @returns {SelectorAST}
 */
export function parseSelector(raw, opts = {}) {
  if (isAST(raw)) return raw;

  // shorthand: scalar ID becomes { _id: <id> }
  if (typeof raw === 'string' || typeof raw === 'number'
      || (typeof Mongo !== 'undefined' && Mongo.ObjectID && raw instanceof Mongo.ObjectID)) {
    return {
      type: AST.AND,
      clauses: [{
        type: AST.FIELD,
        path: ['_id'],
        predicate: { kind: PRED.EQ, value: raw },
      }],
    };
  }

  if (raw === null || raw === undefined) {
    throw new ParseError('Selector must not be null/undefined', raw);
  }
  if (typeof raw === 'boolean' || Array.isArray(raw) || raw instanceof Date) {
    throw new ParseError('Selector top-level must be an object', raw);
  }
  if (typeof raw !== 'object') {
    throw new ParseError(`Selector top-level must be an object, got ${typeof raw}`, raw);
  }

  return parseObjectSelector(raw, opts);
}

function parseObjectSelector(obj, opts) {
  const clauses = [];
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (key.startsWith('$')) {
      clauses.push(parseTopLevelOperator(key, value, opts));
    } else {
      clauses.push(parseFieldClause(key, value, opts));
    }
  }
  return { type: AST.AND, clauses };
}

function parseTopLevelOperator(op, value, opts) {
  switch (op) {
    case '$and':
      requireArrayOfObjects(op, value);
      return { type: AST.AND, clauses: value.map((s) => parseSelector(s, opts)) };
    case '$or':
      requireArrayOfObjects(op, value);
      return { type: AST.OR, clauses: value.map((s) => parseSelector(s, opts)) };
    case '$nor':
      requireArrayOfObjects(op, value);
      return { type: AST.NOR, clauses: value.map((s) => parseSelector(s, opts)) };
    case '$where':
      if (typeof value !== 'function' && typeof value !== 'string') {
        throw new ParseError('$where must be a function or string', value);
      }
      return { type: AST.WHERE, fn: value };
    case '$expr':
      return { type: AST.EXPR, expression: value };
    case '$text':
      return parseTextOperator(value);
    case '$comment':
      // Mongo $comment is metadata; safe to drop.
      return { type: AST.AND, clauses: [] };
    default:
      throw new ParseError(`Unknown top-level operator '${op}'`, op);
  }
}

function parseFieldClause(rawPath, value, opts) {
  const path = pathFromDotted(rawPath);

  // Regex literal shorthand: { name: /^a/i }
  if (value instanceof RegExp) {
    return {
      type: AST.FIELD,
      path,
      predicate: { kind: PRED.REGEX, source: value.source, flags: value.flags },
    };
  }

  // Plain equality: scalar, array, Date, ObjectID, or non-operator object.
  if (!isOperatorObject(value)) {
    return {
      type: AST.FIELD,
      path,
      predicate: { kind: PRED.EQ, value },
    };
  }

  return parseFieldOperatorObject(path, value, opts);
}

const GEO_OPS = ['$near', '$nearSphere', '$geoWithin', '$geoIntersects'];

function parseFieldOperatorObject(path, opObj, opts) {
  const ops = Object.keys(opObj);

  // Geo operators lift to a top-level AST.GEO node (not a Field predicate)
  // so adapter walkers can dispatch on them at the same level as $where/$text.
  const geoOp = ops.find((op) => GEO_OPS.includes(op));
  if (geoOp) {
    return {
      type: AST.GEO,
      op: geoOp.slice(1).replace(/^./, (c) => c.toUpperCase()),
      path,
      operand: opObj[geoOp],
    };
  }

  // Single $not wrapping → AST.NOT around the inner Field clause
  if (ops.length === 1 && ops[0] === '$not') {
    const inner = parseFieldClause(pathToDotted(path), opObj.$not, opts);
    return { type: AST.NOT, clause: inner };
  }

  // Coalesce $regex + $options before dispatch
  let resolvedOps = ops;
  if (ops.includes('$regex') && ops.includes('$options')) {
    resolvedOps = ops.filter((op) => op !== '$options');
  }

  // Multiple operators on one field combine as And of single-op Field clauses
  // — minimongo treats { x: { $gt: 5, $lt: 10 } } as AND.
  const fieldClauses = resolvedOps.map((op) => {
    if (op === '$not') {
      return {
        type: AST.NOT,
        clause: parseFieldClause(pathToDotted(path), opObj.$not, opts),
      };
    }
    const extraOpts = op === '$regex' ? opObj.$options : undefined;
    return {
      type: AST.FIELD,
      path,
      predicate: parsePredicate(op, opObj[op], opts, extraOpts),
    };
  });

  if (fieldClauses.length === 1) return fieldClauses[0];
  return { type: AST.AND, clauses: fieldClauses };
}

function parsePredicate(op, operand, opts, extraOpts) {
  switch (op) {
    case '$eq':  return { kind: PRED.EQ,  value: operand };
    case '$ne':  return { kind: PRED.NE,  value: operand };
    case '$gt':  return { kind: PRED.GT,  value: operand };
    case '$gte': return { kind: PRED.GTE, value: operand };
    case '$lt':  return { kind: PRED.LT,  value: operand };
    case '$lte': return { kind: PRED.LTE, value: operand };
    case '$in':
      if (!Array.isArray(operand)) throw new ParseError('$in needs an array', operand);
      return { kind: PRED.IN, values: operand };
    case '$nin':
      if (!Array.isArray(operand)) throw new ParseError('$nin needs an array', operand);
      return { kind: PRED.NIN, values: operand };
    case '$exists':
      return { kind: PRED.EXISTS, value: !!operand };
    case '$type':
      return { kind: PRED.TYPE, bsonType: operand };
    case '$regex':
      return parseRegexPredicate(operand, extraOpts);
    case '$mod':
      if (!Array.isArray(operand) || operand.length !== 2) {
        throw new ParseError('$mod must be [divisor, remainder]', operand);
      }
      return { kind: PRED.MOD, divisor: operand[0], remainder: operand[1] };
    case '$size':
      return { kind: PRED.SIZE, value: operand };
    case '$all':
      if (!Array.isArray(operand)) throw new ParseError('$all needs an array', operand);
      return { kind: PRED.ALL, values: operand };
    case '$elemMatch':
      return { kind: PRED.ELEM_MATCH, inner: parseSelector(operand, opts) };
    case '$bitsAllSet':   return { kind: PRED.BITS, op: 'AllSet',   mask: operand };
    case '$bitsAllClear': return { kind: PRED.BITS, op: 'AllClear', mask: operand };
    case '$bitsAnySet':   return { kind: PRED.BITS, op: 'AnySet',   mask: operand };
    case '$bitsAnyClear': return { kind: PRED.BITS, op: 'AnyClear', mask: operand };
    case '$options':
      // Handled paired with $regex above — should not reach here standalone.
      throw new ParseError('$options requires $regex', operand);
    default:
      throw new ParseError(`Unknown field operator '${op}'`, op);
  }
}

function parseRegexPredicate(source, flags) {
  if (source instanceof RegExp) {
    return { kind: PRED.REGEX, source: source.source, flags: source.flags };
  }
  return { kind: PRED.REGEX, source: String(source), flags: flags || '' };
}

function parseTextOperator(operand) {
  if (typeof operand !== 'object' || operand === null) {
    throw new ParseError('$text operand must be an object', operand);
  }
  return {
    type: AST.TEXT,
    search: operand.$search,
    language: operand.$language,
    caseSensitive: operand.$caseSensitive,
    diacriticSensitive: operand.$diacriticSensitive,
  };
}

function isOperatorObject(value) {
  if (value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  if (value instanceof RegExp) return false;
  if (typeof Mongo !== 'undefined' && Mongo.ObjectID && value instanceof Mongo.ObjectID) return false;
  const keys = Object.keys(value);
  if (keys.length === 0) return false;
  return keys.every((k) => k.startsWith('$'));
}

function requireArrayOfObjects(op, value) {
  if (!Array.isArray(value)) {
    throw new ParseError(`${op} requires an array`, value);
  }
  for (const item of value) {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new ParseError(`${op} elements must be selector objects`, item);
    }
  }
}
