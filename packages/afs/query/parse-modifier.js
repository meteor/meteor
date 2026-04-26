import { AST, MOD, isAST } from './ast';
import { ParseError } from './errors';
import { pathFromDotted } from './paths';
import { parseSelector, parsePullCriterion } from './parse-selector';
import { parseSort } from './parse-sort';

/**
 * Parse a raw MongoDB-style modifier into a normalized ModifierAST.
 *
 * Returns `{ type: 'ModifierProgram', ops: [...], isReplacement, replacement? }`.
 * If the input has no `$`-prefixed keys, it is treated as a replacement
 * document — `ops` is empty and `replacement` is the input.
 */
export function parseModifier(raw, opts = {}) {
  if (isAST(raw)) return raw;

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ParseError('Modifier must be an object', raw);
  }

  const keys = Object.keys(raw);
  if (keys.length === 0) {
    return { type: AST.MODIFIER_PROGRAM, ops: [], isReplacement: true, replacement: {} };
  }

  const dollarKeys = keys.filter((k) => k.startsWith('$'));
  if (dollarKeys.length === 0) {
    return { type: AST.MODIFIER_PROGRAM, ops: [], isReplacement: true, replacement: raw };
  }
  if (dollarKeys.length !== keys.length) {
    throw new ParseError('Modifier cannot mix $-operators with non-$ keys', raw);
  }

  const ops = [];
  for (const op of dollarKeys) {
    parseOp(op, raw[op], ops);
  }
  return { type: AST.MODIFIER_PROGRAM, ops, isReplacement: false };
}

function parseOp(op, fields, ops) {
  switch (op) {
    case '$set':         emitFieldOps(fields, MOD.SET,           ops); return;
    case '$setOnInsert': emitFieldOps(fields, MOD.SET_ON_INSERT, ops); return;
    case '$unset':       emitFieldOps(fields, MOD.UNSET,         ops); return;
    case '$inc':         emitFieldOps(fields, MOD.INC,           ops); return;
    case '$mul':         emitFieldOps(fields, MOD.MUL,           ops); return;
    case '$min':         emitFieldOps(fields, MOD.MIN,           ops); return;
    case '$max':         emitFieldOps(fields, MOD.MAX,           ops); return;
    case '$rename':
      for (const from of Object.keys(fields)) {
        ops.push({
          kind: MOD.RENAME,
          from: pathFromDotted(from),
          to:   pathFromDotted(fields[from]),
        });
      }
      return;
    case '$currentDate':
      for (const f of Object.keys(fields)) {
        const arg = fields[f];
        let asTimestamp = false;
        if (typeof arg === 'object' && arg !== null && arg.$type) {
          if (arg.$type === 'timestamp') asTimestamp = true;
          else if (arg.$type !== 'date')
            throw new ParseError(`$currentDate $type must be 'date' or 'timestamp'`, arg);
        } else if (arg !== true) {
          throw new ParseError(`$currentDate field value must be true or {$type:...}`, arg);
        }
        ops.push({ kind: MOD.CURRENT_DATE, path: pathFromDotted(f), asTimestamp });
      }
      return;
    case '$push':
      for (const f of Object.keys(fields)) ops.push(parsePushOp(f, fields[f]));
      return;
    case '$pop':
      for (const f of Object.keys(fields)) {
        const dir = fields[f];
        if (dir !== 1 && dir !== -1)
          throw new ParseError('$pop value must be 1 or -1', dir);
        ops.push({ kind: MOD.POP, path: pathFromDotted(f), from: dir === 1 ? 'last' : 'first' });
      }
      return;
    case '$pull':
      for (const f of Object.keys(fields)) {
        ops.push({
          kind: MOD.PULL,
          path: pathFromDotted(f),
          criterion: parsePullCriterion(fields[f]),
        });
      }
      return;
    case '$pullAll':
      for (const f of Object.keys(fields)) {
        const vals = fields[f];
        if (!Array.isArray(vals)) throw new ParseError('$pullAll value must be an array', vals);
        ops.push({ kind: MOD.PULL_ALL, path: pathFromDotted(f), values: vals });
      }
      return;
    case '$addToSet':
      for (const f of Object.keys(fields)) {
        const arg = fields[f];
        const values = (arg && typeof arg === 'object' && Array.isArray(arg.$each))
          ? arg.$each
          : [arg];
        ops.push({ kind: MOD.ADD_TO_SET, path: pathFromDotted(f), values });
      }
      return;
    case '$bit':
      for (const f of Object.keys(fields)) {
        const arg = fields[f];
        if (!arg || typeof arg !== 'object')
          throw new ParseError('$bit operand must be an object', arg);
        const ks = Object.keys(arg);
        if (ks.length !== 1 || !['and', 'or', 'xor'].includes(ks[0]))
          throw new ParseError('$bit operand must be {and|or|xor: number}', arg);
        ops.push({ kind: MOD.BIT, path: pathFromDotted(f), op: ks[0], operand: arg[ks[0]] });
      }
      return;
    default:
      throw new ParseError(`Unknown modifier operator '${op}'`, op);
  }
}

function emitFieldOps(fields, kind, ops) {
  for (const f of Object.keys(fields)) {
    ops.push({ kind, path: pathFromDotted(f), value: fields[f] });
  }
}

function parsePushOp(field, arg) {
  const path = pathFromDotted(field);
  if (arg && typeof arg === 'object' && '$each' in arg) {
    if (!Array.isArray(arg.$each))
      throw new ParseError('$push.$each must be an array', arg.$each);
    let sortAST = null;
    if ('$sort' in arg) {
      sortAST = typeof arg.$sort === 'object' ? parseSort(arg.$sort) : arg.$sort;
    }
    return {
      kind: MOD.PUSH,
      path,
      value: arg.$each.length === 1 ? arg.$each[0] : null,
      each: arg.$each,
      position: '$position' in arg ? arg.$position : null,
      slice: '$slice' in arg ? arg.$slice : null,
      sort: sortAST,
    };
  }
  return {
    kind: MOD.PUSH, path, value: arg,
    each: null, position: null, slice: null, sort: null,
  };
}

