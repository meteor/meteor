import { AST, PRED, MOD } from './ast';
import { pathToDotted } from './paths';

/**
 * Reconstitute a raw MongoDB selector from a SelectorAST.
 * Used by `match` to feed `Minimongo.Matcher`.
 */
export function astToRawSelector(ast) {
  switch (ast.type) {
    case AST.AND:
      if (ast.clauses.length === 0) return {};
      if (ast.clauses.length === 1) return astToRawSelector(ast.clauses[0]);
      return { $and: ast.clauses.map(astToRawSelector) };
    case AST.OR:
      return { $or: ast.clauses.map(astToRawSelector) };
    case AST.NOR:
      return { $nor: ast.clauses.map(astToRawSelector) };
    case AST.NOT:
      return wrapWithNot(ast.clause);
    case AST.FIELD:
      return { [pathToDotted(ast.path)]: predicateToRaw(ast.predicate) };
    case AST.WHERE:
      return { $where: ast.fn };
    case AST.EXPR:
      return { $expr: ast.expression };
    case AST.GEO: {
      const opKey = '$' + ast.op[0].toLowerCase() + ast.op.slice(1);
      return { [pathToDotted(ast.path)]: { [opKey]: ast.operand } };
    }
    case AST.TEXT: {
      const t = { $search: ast.search };
      if (ast.language) t.$language = ast.language;
      if (ast.caseSensitive !== undefined) t.$caseSensitive = ast.caseSensitive;
      if (ast.diacriticSensitive !== undefined) t.$diacriticSensitive = ast.diacriticSensitive;
      return { $text: t };
    }
    default:
      throw new Error(`astToRawSelector: unknown AST type '${ast.type}'`);
  }
}

function wrapWithNot(inner) {
  // Inner is always a Field node when produced by parseSelector.
  if (inner.type !== AST.FIELD) {
    throw new Error('astToRawSelector: $not inner must be a Field node');
  }
  return { [pathToDotted(inner.path)]: { $not: predicateToRaw(inner.predicate) } };
}

function predicateToRaw(p) {
  switch (p.kind) {
    case PRED.EQ:  return p.value;          // bare value preserves equality semantics
    case PRED.NE:  return { $ne:  p.value };
    case PRED.GT:  return { $gt:  p.value };
    case PRED.GTE: return { $gte: p.value };
    case PRED.LT:  return { $lt:  p.value };
    case PRED.LTE: return { $lte: p.value };
    case PRED.IN:  return { $in:  p.values };
    case PRED.NIN: return { $nin: p.values };
    case PRED.EXISTS: return { $exists: p.value };
    case PRED.TYPE:   return { $type:   p.bsonType };
    case PRED.REGEX:
      return p.flags
        ? { $regex: p.source, $options: p.flags }
        : { $regex: p.source };
    case PRED.MOD:    return { $mod:  [p.divisor, p.remainder] };
    case PRED.SIZE:   return { $size: p.value };
    case PRED.ALL:    return { $all:  p.values };
    case PRED.ELEM_MATCH:
      return { $elemMatch: astToRawSelector(p.inner) };
    case PRED.BITS: {
      const opKey = `$bits${p.op}`;
      return { [opKey]: p.mask };
    }
    default:
      throw new Error(`predicateToRaw: unknown predicate kind '${p.kind}'`);
  }
}

/**
 * Reconstitute a raw MongoDB modifier from a ModifierAST.
 * Replacement-doc programs are not handled here — the caller must check
 * `ast.isReplacement` first and use `ast.replacement` directly.
 */
export function astToRawModifier(ast) {
  if (ast.isReplacement) {
    throw new Error('astToRawModifier: cannot reconstitute a replacement-doc program');
  }
  const out = {};
  for (const op of ast.ops) {
    switch (op.kind) {
      case MOD.SET:           addToOpBucket(out, '$set',         op.path, op.value); break;
      case MOD.SET_ON_INSERT: addToOpBucket(out, '$setOnInsert', op.path, op.value); break;
      case MOD.UNSET:         addToOpBucket(out, '$unset',       op.path, op.value); break;
      case MOD.INC:           addToOpBucket(out, '$inc',         op.path, op.value); break;
      case MOD.MUL:           addToOpBucket(out, '$mul',         op.path, op.value); break;
      case MOD.MIN:           addToOpBucket(out, '$min',         op.path, op.value); break;
      case MOD.MAX:           addToOpBucket(out, '$max',         op.path, op.value); break;
      case MOD.RENAME:
        (out.$rename ||= {})[pathToDotted(op.from)] = pathToDotted(op.to);
        break;
      case MOD.CURRENT_DATE:
        (out.$currentDate ||= {})[pathToDotted(op.path)] =
          op.asTimestamp ? { $type: 'timestamp' } : true;
        break;
      case MOD.PUSH: {
        const bucket = (out.$push ||= {});
        if (op.each !== null || op.position !== null || op.slice !== null || op.sort !== null) {
          const args = { $each: op.each };
          if (op.position !== null) args.$position = op.position;
          if (op.slice !== null) args.$slice = op.slice;
          if (op.sort !== null) args.$sort = sortToRaw(op.sort);
          bucket[pathToDotted(op.path)] = args;
        } else {
          bucket[pathToDotted(op.path)] = op.value;
        }
        break;
      }
      case MOD.POP:
        (out.$pop ||= {})[pathToDotted(op.path)] = op.from === 'last' ? 1 : -1;
        break;
      case MOD.PULL: {
        const criterion = (op.criterion && typeof op.criterion === 'object' && op.criterion.type)
          ? astToRawSelector(op.criterion)
          : op.criterion;
        (out.$pull ||= {})[pathToDotted(op.path)] = criterion;
        break;
      }
      case MOD.PULL_ALL:
        (out.$pullAll ||= {})[pathToDotted(op.path)] = op.values;
        break;
      case MOD.ADD_TO_SET: {
        const bucket = (out.$addToSet ||= {});
        bucket[pathToDotted(op.path)] = op.values.length === 1
          ? op.values[0]
          : { $each: op.values };
        break;
      }
      case MOD.BIT:
        (out.$bit ||= {})[pathToDotted(op.path)] = { [op.op]: op.operand };
        break;
      default:
        throw new Error(`astToRawModifier: unknown ModOp kind '${op.kind}'`);
    }
  }
  return out;
}

function addToOpBucket(out, op, path, value) {
  (out[op] ||= {})[pathToDotted(path)] = value;
}

function sortToRaw(sort) {
  // $push.$each.$sort accepts either a scalar (1/-1, sorts the elements
  // themselves) or a SortAST produced from an object spec like { score: 1 }.
  if (sort && typeof sort === 'object' && sort.type === AST.SORT) {
    const out = {};
    for (const k of sort.keys) {
      out[pathToDotted(k.path)] = k.direction === 'desc' ? -1 : 1;
    }
    return out;
  }
  return sort;
}
