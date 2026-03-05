/**
 * SQL Compiler — Schema-aware compilation of MongoDB-style selectors,
 * modifiers, and sort specs into parameterized PostgreSQL SQL.
 *
 * All compilers route through resolveField() to determine whether
 * a field targets a native column, JSONB path, or _extra overflow.
 */

import { resolveField, quoteIdent } from './schema';
import { documentToRow } from './row_converter';

// ---------------------------------------------------------------------------
// CompilationContext — tracks $N parameter indices and accumulated values
// ---------------------------------------------------------------------------

export class CompilationContext {
  constructor() {
    this.values = [];
    this._idx = 0;
  }

  /**
   * Add a parameter value and return its $N placeholder.
   * @param {*} value
   * @returns {string} e.g. '$1', '$2'
   */
  addParam(value) {
    this._idx++;
    this.values.push(value);
    return `$${this._idx}`;
  }

  /**
   * Current parameter count.
   * @returns {number}
   */
  get paramCount() {
    return this._idx;
  }
}

// ---------------------------------------------------------------------------
// Selector Compiler
// ---------------------------------------------------------------------------

/**
 * Compile a MongoDB-style selector into a parameterized WHERE clause.
 *
 * @param {Object} selector - MongoDB-style selector
 * @param {import('./schema').ResolvedSchema|null} schema
 * @returns {{ text: string, values: any[] }}
 */
export function compileSelector(selector, schema) {
  const ctx = new CompilationContext();

  if (!selector || Object.keys(selector).length === 0) {
    return { text: 'TRUE', values: [] };
  }

  const text = compileSelectorInner(selector, schema, ctx);
  return { text: text || 'TRUE', values: ctx.values };
}

function compileSelectorInner(selector, schema, ctx) {
  const clauses = [];

  for (const [key, value] of Object.entries(selector)) {
    if (key === '$and') {
      const inner = value.map(sub => compileSelectorInner(sub, schema, ctx));
      clauses.push(`(${inner.join(' AND ')})`);
    } else if (key === '$or') {
      const inner = value.map(sub => compileSelectorInner(sub, schema, ctx));
      clauses.push(`(${inner.join(' OR ')})`);
    } else if (key === '$nor') {
      const inner = value.map(sub => compileSelectorInner(sub, schema, ctx));
      clauses.push(`NOT (${inner.join(' OR ')})`);
    } else if (key === '$not') {
      const inner = compileSelectorInner(value, schema, ctx);
      clauses.push(`NOT (${inner})`);
    } else if (key === '$where') {
      throw new Error('$where is not supported in Postgres collections');
    } else if (key === '$near' || key === '$geoWithin' || key === '$geoIntersects') {
      throw new Error(`${key} geo queries are not supported in Postgres collections (future: PostGIS)`);
    } else if (key === '$comment') {
      // Ignore $comment
      continue;
    } else {
      // Field-level selector
      clauses.push(compileFieldSelector(key, value, schema, ctx));
    }
  }

  return clauses.length > 0 ? clauses.join(' AND ') : 'TRUE';
}

function compileFieldSelector(fieldPath, value, schema, ctx) {
  const resolved = resolveField(fieldPath, schema);

  // Plain value (no operator object) — equality match
  if (value === null || value === undefined) {
    return compileNullCheck(resolved, true);
  }

  if (typeof value !== 'object' || value instanceof Date || Array.isArray(value)) {
    return compileEquality(resolved, value, schema, ctx);
  }

  // Check if value is an operator object (keys start with $)
  const keys = Object.keys(value);
  const isOperatorObj = keys.length > 0 && keys.every(k => k.startsWith('$'));

  if (!isOperatorObj) {
    // Plain object equality (deep match)
    return compileEquality(resolved, value, schema, ctx);
  }

  // Compile each operator
  const opClauses = [];
  for (const [op, operand] of Object.entries(value)) {
    opClauses.push(compileOperator(resolved, op, operand, fieldPath, schema, ctx));
  }

  return opClauses.length === 1 ? opClauses[0] : `(${opClauses.join(' AND ')})`;
}

function compileEquality(resolved, value, schema, ctx) {
  const { kind, sqlRef } = resolved;

  if (value === null || value === undefined) {
    return compileNullCheck(resolved, true);
  }

  // For JSONB columns that may store arrays: match both scalar equality
  // and array containment (MongoDB behavior: { tags: 'a' } matches
  // both { tags: 'a' } and { tags: ['a', 'b'] })
  if (kind === 'jsonb_column') {
    const param = ctx.addParam(JSON.stringify(value));
    return `(${sqlRef} = ${param}::jsonb OR ${sqlRef} @> ${param}::jsonb)`;
  }

  if (kind === 'jsonb_path' || kind === 'extra' || kind === 'extra_path') {
    // JSONB text extraction needs type-aware comparison
    return compileTypedComparison(sqlRef, '=', value, ctx);
  }

  // Native column — direct comparison
  const param = ctx.addParam(value);
  return `${sqlRef} = ${param}`;
}

function compileNullCheck(resolved, isNull) {
  const { kind, sqlRef, topLevelField } = resolved;

  if (kind === 'column') {
    return isNull ? `${sqlRef} IS NULL` : `${sqlRef} IS NOT NULL`;
  }
  if (kind === 'jsonb_column') {
    return isNull ? `${sqlRef} IS NULL` : `${sqlRef} IS NOT NULL`;
  }
  if (kind === 'jsonb_path') {
    // For JSONB path, check if the key exists
    const quotedTop = quoteIdent(topLevelField);
    if (resolved.jsonPath && resolved.jsonPath.length === 1) {
      return isNull
        ? `NOT (${quotedTop} ? '${resolved.jsonPath[0]}')`
        : `${quotedTop} ? '${resolved.jsonPath[0]}'`;
    }
    return isNull ? `${sqlRef} IS NULL` : `${sqlRef} IS NOT NULL`;
  }
  if (kind === 'extra' || kind === 'extra_path') {
    if (kind === 'extra') {
      return isNull
        ? `NOT (_extra ? '${topLevelField}')`
        : `_extra ? '${topLevelField}'`;
    }
    return isNull ? `${sqlRef} IS NULL` : `${sqlRef} IS NOT NULL`;
  }

  return isNull ? `${sqlRef} IS NULL` : `${sqlRef} IS NOT NULL`;
}

function compileOperator(resolved, op, operand, fieldPath, schema, ctx) {
  const { kind, sqlRef } = resolved;

  switch (op) {
    case '$eq':
      return compileEquality(resolved, operand, schema, ctx);

    case '$ne': {
      if (operand === null || operand === undefined) {
        return compileNullCheck(resolved, false);
      }
      if (kind === 'column' || kind === 'jsonb_column') {
        const param = ctx.addParam(operand);
        return `(${sqlRef} != ${param} OR ${sqlRef} IS NULL)`;
      }
      const neClause = compileTypedComparison(sqlRef, '!=', operand, ctx);
      return `(${neClause} OR ${sqlRef} IS NULL)`;
    }

    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte': {
      const sqlOp = { $gt: '>', $gte: '>=', $lt: '<', $lte: '<=' }[op];
      if (kind === 'column') {
        const param = ctx.addParam(operand);
        return `${sqlRef} ${sqlOp} ${param}`;
      }
      return compileTypedComparison(sqlRef, sqlOp, operand, ctx);
    }

    case '$in': {
      if (!Array.isArray(operand)) throw new Error('$in requires an array');
      const hasNull = operand.includes(null);
      const nonNull = operand.filter(v => v !== null);
      const parts = [];

      if (nonNull.length > 0) {
        if (kind === 'column') {
          const param = ctx.addParam(nonNull);
          parts.push(`${sqlRef} = ANY(${param})`);
        } else {
          // For JSONB fields, use OR
          const orClauses = nonNull.map(v => compileTypedComparison(sqlRef, '=', v, ctx));
          parts.push(`(${orClauses.join(' OR ')})`);
        }
      }

      if (hasNull) {
        parts.push(compileNullCheck(resolved, true));
      }

      return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`;
    }

    case '$nin': {
      if (!Array.isArray(operand)) throw new Error('$nin requires an array');
      const hasNull = operand.includes(null);
      const nonNull = operand.filter(v => v !== null);
      const parts = [];

      if (nonNull.length > 0) {
        if (kind === 'column') {
          const param = ctx.addParam(nonNull);
          parts.push(`NOT (${sqlRef} = ANY(${param}))`);
        } else {
          const orClauses = nonNull.map(v => compileTypedComparison(sqlRef, '=', v, ctx));
          parts.push(`NOT (${orClauses.join(' OR ')})`);
        }
      }

      if (hasNull) {
        parts.push(compileNullCheck(resolved, false));
      }

      return parts.length === 0 ? 'TRUE' : parts.length === 1 ? parts[0] : `(${parts.join(' AND ')})`;
    }

    case '$exists': {
      return compileNullCheck(resolved, !operand);
    }

    case '$regex': {
      let pattern = operand;
      let flags = '';

      if (operand instanceof RegExp) {
        pattern = operand.source;
        flags = operand.flags;
      }

      // Check for $options alongside $regex
      // (handled at the parent level, but operand might have flags)
      const caseInsensitive = flags.includes('i');
      const regexOp = caseInsensitive ? '~*' : '~';

      if (kind === 'column' || kind === 'jsonb_column') {
        const param = ctx.addParam(pattern);
        return `${sqlRef} ${regexOp} ${param}`;
      }
      const param = ctx.addParam(pattern);
      return `${sqlRef} ${regexOp} ${param}`;
    }

    case '$options':
      // Handled as part of $regex — ignored standalone
      return 'TRUE';

    case '$mod': {
      if (!Array.isArray(operand) || operand.length !== 2) {
        throw new Error('$mod requires a two-element array [divisor, remainder]');
      }
      const [divisor, remainder] = operand;
      if (kind === 'column') {
        const pDiv = ctx.addParam(divisor);
        const pRem = ctx.addParam(remainder);
        return `${sqlRef} % ${pDiv} = ${pRem}`;
      }
      // JSONB — need cast
      const pDiv = ctx.addParam(divisor);
      const pRem = ctx.addParam(remainder);
      return `(${sqlRef})::numeric % ${pDiv} = ${pRem}`;
    }

    case '$not': {
      // $not wraps another operator
      if (typeof operand === 'object' && !(operand instanceof RegExp)) {
        const inner = [];
        for (const [innerOp, innerVal] of Object.entries(operand)) {
          inner.push(compileOperator(resolved, innerOp, innerVal, fieldPath, schema, ctx));
        }
        return `NOT (${inner.join(' AND ')})`;
      }
      // $not with a regex
      if (operand instanceof RegExp) {
        const pattern = operand.source;
        const caseInsensitive = operand.flags.includes('i');
        const regexOp = caseInsensitive ? '~*' : '~';
        const param = ctx.addParam(pattern);
        return `NOT (${sqlRef} ${regexOp} ${param})`;
      }
      // $not with a value — not equal
      const param = ctx.addParam(operand);
      return `${sqlRef} != ${param}`;
    }

    case '$all': {
      if (!Array.isArray(operand)) throw new Error('$all requires an array');
      if (kind === 'jsonb_column') {
        const param = ctx.addParam(JSON.stringify(operand));
        return `${sqlRef} @> ${param}::jsonb`;
      }
      // For non-JSONB, each element must match
      const allClauses = operand.map(v => compileEquality(resolved, v, schema, ctx));
      return `(${allClauses.join(' AND ')})`;
    }

    case '$size': {
      if (kind === 'jsonb_column') {
        const param = ctx.addParam(operand);
        return `jsonb_array_length(${sqlRef}) = ${param}`;
      }
      // _extra field
      const topRef = resolved.kind === 'extra'
        ? `_extra->'${resolved.topLevelField}'`
        : sqlRef;
      const param = ctx.addParam(operand);
      return `jsonb_array_length(${topRef}) = ${param}`;
    }

    case '$elemMatch': {
      // EXISTS subquery over jsonb_array_elements
      let arrayRef;
      if (kind === 'jsonb_column') {
        arrayRef = sqlRef;
      } else if (kind === 'extra') {
        arrayRef = `_extra->'${resolved.topLevelField}'`;
      } else {
        throw new Error(`$elemMatch requires a JSONB array field, got ${kind} for ${fieldPath}`);
      }

      const innerClauses = [];
      for (const [subKey, subVal] of Object.entries(operand)) {
        if (subKey.startsWith('$')) {
          // Operator on element itself
          innerClauses.push(compileElemOperator('elem', subKey, subVal, ctx));
        } else {
          // Field within array element
          const subRef = `elem->>'${subKey}'`;
          if (typeof subVal === 'object' && subVal !== null && !Array.isArray(subVal) && !(subVal instanceof Date)) {
            for (const [subOp, subOperand] of Object.entries(subVal)) {
              innerClauses.push(compileElemOperator(subRef, subOp, subOperand, ctx));
            }
          } else {
            const param = ctx.addParam(typeof subVal === 'string' ? subVal : String(subVal));
            innerClauses.push(`${subRef} = ${param}`);
          }
        }
      }

      return `EXISTS (SELECT 1 FROM jsonb_array_elements(${arrayRef}) elem WHERE ${innerClauses.join(' AND ')})`;
    }

    case '$type': {
      // Basic $type support
      const typeMap = {
        'double': 'number', 'string': 'string', 'object': 'object',
        'array': 'array', 'bool': 'boolean', 'null': 'null',
        'int': 'number', 'number': 'number',
      };
      const pgType = typeMap[operand] || operand;
      if (kind === 'jsonb_column') {
        return `jsonb_typeof(${sqlRef}) = '${pgType}'`;
      }
      return 'TRUE'; // Fallback for non-JSONB columns
    }

    default:
      throw new Error(`Unsupported selector operator: ${op}`);
  }
}

function compileElemOperator(ref, op, operand, ctx) {
  switch (op) {
    case '$eq': {
      const param = ctx.addParam(String(operand));
      return `${ref}::text = ${param}`;
    }
    case '$gt':
    case '$gte':
    case '$lt':
    case '$lte': {
      const sqlOp = { $gt: '>', $gte: '>=', $lt: '<', $lte: '<=' }[op];
      const param = ctx.addParam(operand);
      return `(${ref}::text)::numeric ${sqlOp} ${param}`;
    }
    case '$ne': {
      const param = ctx.addParam(String(operand));
      return `${ref}::text != ${param}`;
    }
    case '$regex': {
      const param = ctx.addParam(operand instanceof RegExp ? operand.source : operand);
      return `${ref}::text ~ ${param}`;
    }
    default:
      throw new Error(`Unsupported $elemMatch operator: ${op}`);
  }
}

/**
 * Type-aware comparison for JSONB-extracted text values.
 * ->> returns text, so we cast based on JS operand type.
 */
function compileTypedComparison(sqlRef, op, value, ctx) {
  if (value === null || value === undefined) {
    if (op === '=') return `${sqlRef} IS NULL`;
    if (op === '!=') return `${sqlRef} IS NOT NULL`;
  }

  const param = ctx.addParam(value);

  if (typeof value === 'number') {
    return `(${sqlRef})::numeric ${op} ${param}`;
  }
  if (typeof value === 'boolean') {
    return `(${sqlRef})::boolean ${op} ${param}`;
  }
  if (value instanceof Date) {
    return `(${sqlRef})::timestamptz ${op} ${param}`;
  }

  // Default: text comparison
  return `${sqlRef} ${op} ${param}`;
}

// ---------------------------------------------------------------------------
// Modifier Compiler
// ---------------------------------------------------------------------------

/**
 * Compile a MongoDB-style modifier into SQL SET clauses.
 *
 * Returns { setClauses, values, needsFetchModifyWrite, fetchModifyWriteOps }
 *
 * When needsFetchModifyWrite is true, the caller must use a transaction:
 * SELECT FOR UPDATE → LocalCollection._modify() → full row UPDATE.
 *
 * @param {Object} modifier
 * @param {import('./schema').ResolvedSchema|null} schema
 * @returns {{ setClauses: string[], values: any[], needsFetchModifyWrite: boolean, fetchModifyWriteOps: string[] }}
 */
export function compileModifier(modifier, schema) {
  // Check if this is a replacement document (no $ operators)
  const keys = Object.keys(modifier);
  const isReplacement = keys.length > 0 && !keys.some(k => k.startsWith('$'));

  if (isReplacement) {
    return compileReplacementDoc(modifier, schema);
  }

  const ctx = new CompilationContext();
  const setClauses = [];
  const fetchModifyWriteOps = [];
  let needsFetchModifyWrite = false;

  for (const [op, fields] of Object.entries(modifier)) {
    switch (op) {
      case '$set':
        for (const [field, value] of Object.entries(fields)) {
          const clause = compileSet(field, value, schema, ctx);
          if (clause) setClauses.push(clause);
        }
        break;

      case '$unset':
        for (const [field] of Object.entries(fields)) {
          const clause = compileUnset(field, schema, ctx);
          if (clause) setClauses.push(clause);
        }
        break;

      case '$inc':
        for (const [field, value] of Object.entries(fields)) {
          const clause = compileInc(field, value, schema, ctx);
          if (clause) setClauses.push(clause);
        }
        break;

      case '$mul':
        for (const [field, value] of Object.entries(fields)) {
          const clause = compileMul(field, value, schema, ctx);
          if (clause) setClauses.push(clause);
        }
        break;

      case '$min':
        for (const [field, value] of Object.entries(fields)) {
          const clause = compileMin(field, value, schema, ctx);
          if (clause) setClauses.push(clause);
        }
        break;

      case '$max':
        for (const [field, value] of Object.entries(fields)) {
          const clause = compileMax(field, value, schema, ctx);
          if (clause) setClauses.push(clause);
        }
        break;

      case '$currentDate':
        for (const [field] of Object.entries(fields)) {
          const clause = compileCurrentDate(field, schema);
          if (clause) setClauses.push(clause);
        }
        break;

      case '$rename':
        // Rename is complex — use fetch-modify-write
        needsFetchModifyWrite = true;
        fetchModifyWriteOps.push(op);
        break;

      case '$push':
      case '$addToSet':
      case '$pull':
      case '$pop':
      case '$pullAll': {
        // Check if we can do a simple $push without $each/$position/$slice/$sort
        if (op === '$push') {
          for (const [field, value] of Object.entries(fields)) {
            if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date) && ('$each' in value || '$position' in value || '$slice' in value || '$sort' in value)) {
              needsFetchModifyWrite = true;
              fetchModifyWriteOps.push(op);
            } else {
              const clause = compileSimplePush(field, value, schema, ctx);
              if (clause) setClauses.push(clause);
            }
          }
        } else {
          needsFetchModifyWrite = true;
          fetchModifyWriteOps.push(op);
        }
        break;
      }

      default:
        // Unknown operator — fall back to fetch-modify-write
        needsFetchModifyWrite = true;
        fetchModifyWriteOps.push(op);
        break;
    }
  }

  return {
    setClauses,
    values: ctx.values,
    needsFetchModifyWrite,
    fetchModifyWriteOps,
  };
}

function compileSet(field, value, schema, ctx) {
  const resolved = resolveField(field, schema);

  if (resolved.kind === 'column') {
    const param = ctx.addParam(value);
    return `${resolved.sqlRef} = ${param}`;
  }

  if (resolved.kind === 'jsonb_column') {
    const param = ctx.addParam(value);
    return `${resolved.sqlRef} = ${param}`;
  }

  if (resolved.kind === 'jsonb_path') {
    const quotedTop = quoteIdent(resolved.topLevelField);
    const path = `{${resolved.jsonPath.join(',')}}`;
    const param = ctx.addParam(JSON.stringify(value));
    return `${quotedTop} = jsonb_set(COALESCE(${quotedTop}, '{}'), '${path}', ${param}::jsonb)`;
  }

  if (resolved.kind === 'extra') {
    const param = ctx.addParam(JSON.stringify(value));
    return `_extra = jsonb_set(COALESCE(_extra, '{}'), '{${resolved.topLevelField}}', ${param}::jsonb)`;
  }

  if (resolved.kind === 'extra_path') {
    const parts = field.split('.');
    const path = `{${parts.join(',')}}`;
    const param = ctx.addParam(JSON.stringify(value));
    return `_extra = jsonb_set(COALESCE(_extra, '{}'), '${path}', ${param}::jsonb)`;
  }

  return null;
}

function compileUnset(field, schema, ctx) {
  const resolved = resolveField(field, schema);

  if (resolved.kind === 'column') {
    return `${resolved.sqlRef} = NULL`;
  }

  if (resolved.kind === 'jsonb_column') {
    return `${resolved.sqlRef} = NULL`;
  }

  if (resolved.kind === 'jsonb_path') {
    const quotedTop = quoteIdent(resolved.topLevelField);
    if (resolved.jsonPath.length === 1) {
      return `${quotedTop} = ${quotedTop} - '${resolved.jsonPath[0]}'`;
    }
    const path = `{${resolved.jsonPath.join(',')}}`;
    return `${quotedTop} = ${quotedTop} #- '${path}'`;
  }

  if (resolved.kind === 'extra') {
    return `_extra = _extra - '${resolved.topLevelField}'`;
  }

  if (resolved.kind === 'extra_path') {
    const parts = field.split('.');
    const path = `{${parts.join(',')}}`;
    return `_extra = _extra #- '${path}'`;
  }

  return null;
}

function compileInc(field, value, schema, ctx) {
  const resolved = resolveField(field, schema);

  if (resolved.kind === 'column') {
    const param = ctx.addParam(value);
    return `${resolved.sqlRef} = COALESCE(${resolved.sqlRef}, 0) + ${param}`;
  }

  if (resolved.kind === 'jsonb_path') {
    const quotedTop = quoteIdent(resolved.topLevelField);
    const path = `{${resolved.jsonPath.join(',')}}`;
    const param = ctx.addParam(value);
    return `${quotedTop} = jsonb_set(COALESCE(${quotedTop}, '{}'), '${path}', to_jsonb(COALESCE((${quotedTop} #>> '${path}')::numeric, 0) + ${param}))`;
  }

  if (resolved.kind === 'extra') {
    const param = ctx.addParam(value);
    return `_extra = jsonb_set(COALESCE(_extra, '{}'), '{${resolved.topLevelField}}', to_jsonb(COALESCE((_extra->>'${resolved.topLevelField}')::numeric, 0) + ${param}))`;
  }

  if (resolved.kind === 'jsonb_column') {
    // Incrementing a whole JSONB column doesn't make sense for objects, but works for numeric values
    const param = ctx.addParam(value);
    return `${resolved.sqlRef} = to_jsonb(COALESCE((${resolved.sqlRef})::numeric, 0) + ${param})`;
  }

  return null;
}

function compileMul(field, value, schema, ctx) {
  const resolved = resolveField(field, schema);

  if (resolved.kind === 'column') {
    const param = ctx.addParam(value);
    return `${resolved.sqlRef} = COALESCE(${resolved.sqlRef}, 0) * ${param}`;
  }

  if (resolved.kind === 'jsonb_path') {
    const quotedTop = quoteIdent(resolved.topLevelField);
    const path = `{${resolved.jsonPath.join(',')}}`;
    const param = ctx.addParam(value);
    return `${quotedTop} = jsonb_set(COALESCE(${quotedTop}, '{}'), '${path}', to_jsonb(COALESCE((${quotedTop} #>> '${path}')::numeric, 0) * ${param}))`;
  }

  if (resolved.kind === 'extra') {
    const param = ctx.addParam(value);
    return `_extra = jsonb_set(COALESCE(_extra, '{}'), '{${resolved.topLevelField}}', to_jsonb(COALESCE((_extra->>'${resolved.topLevelField}')::numeric, 0) * ${param}))`;
  }

  return null;
}

function compileMin(field, value, schema, ctx) {
  const resolved = resolveField(field, schema);

  if (resolved.kind === 'column') {
    const param = ctx.addParam(value);
    return `${resolved.sqlRef} = LEAST(COALESCE(${resolved.sqlRef}, ${param}), ${param})`;
  }

  return null; // Complex min on JSONB — fall back to fetch-modify-write
}

function compileMax(field, value, schema, ctx) {
  const resolved = resolveField(field, schema);

  if (resolved.kind === 'column') {
    const param = ctx.addParam(value);
    return `${resolved.sqlRef} = GREATEST(COALESCE(${resolved.sqlRef}, ${param}), ${param})`;
  }

  return null;
}

function compileCurrentDate(field, schema) {
  const resolved = resolveField(field, schema);

  if (resolved.kind === 'column') {
    return `${resolved.sqlRef} = NOW()`;
  }

  if (resolved.kind === 'jsonb_path') {
    const quotedTop = quoteIdent(resolved.topLevelField);
    const path = `{${resolved.jsonPath.join(',')}}`;
    return `${quotedTop} = jsonb_set(COALESCE(${quotedTop}, '{}'), '${path}', to_jsonb(NOW()))`;
  }

  if (resolved.kind === 'extra') {
    return `_extra = jsonb_set(COALESCE(_extra, '{}'), '{${resolved.topLevelField}}', to_jsonb(NOW()))`;
  }

  return null;
}

function compileSimplePush(field, value, schema, ctx) {
  const resolved = resolveField(field, schema);

  if (resolved.kind === 'jsonb_column') {
    const param = ctx.addParam(JSON.stringify(value));
    return `${resolved.sqlRef} = COALESCE(${resolved.sqlRef}, '[]'::jsonb) || ${param}::jsonb`;
  }

  if (resolved.kind === 'extra') {
    const param = ctx.addParam(JSON.stringify(value));
    const topField = resolved.topLevelField;
    return `_extra = jsonb_set(COALESCE(_extra, '{}'), '{${topField}}', COALESCE(_extra->'${topField}', '[]'::jsonb) || ${param}::jsonb)`;
  }

  return null;
}

function compileReplacementDoc(doc, schema) {
  const ctx = new CompilationContext();
  const setClauses = [];

  const row = documentToRow(doc, schema);

  // Set all schema columns
  if (schema) {
    for (const colName of schema.getColumnNames()) {
      const value = row[colName];
      if (value !== undefined) {
        const param = ctx.addParam(value);
        setClauses.push(`${quoteIdent(colName)} = ${param}`);
      } else {
        setClauses.push(`${quoteIdent(colName)} = NULL`);
      }
    }
  }

  // Set _extra
  const param = ctx.addParam(row._extra || {});
  setClauses.push(`_extra = ${param}`);

  return {
    setClauses,
    values: ctx.values,
    needsFetchModifyWrite: false,
    fetchModifyWriteOps: [],
  };
}

// ---------------------------------------------------------------------------
// Sort Compiler
// ---------------------------------------------------------------------------

/**
 * Compile a MongoDB-style sort specification into SQL ORDER BY clause.
 *
 * @param {Object|Array} sortSpec - e.g. { views: -1, title: 1 } or [['views', 'desc']]
 * @param {import('./schema').ResolvedSchema|null} schema
 * @returns {string} SQL ORDER BY clause (without "ORDER BY" prefix)
 */
export function compileSort(sortSpec, schema) {
  if (!sortSpec) return '';

  let entries;
  if (Array.isArray(sortSpec)) {
    // Array format: [['field', 'asc'|'desc']]
    entries = sortSpec.map(([field, dir]) => [field, dir === 'desc' ? -1 : 1]);
  } else {
    entries = Object.entries(sortSpec);
  }

  if (entries.length === 0) return '';

  const parts = entries.map(([field, dir]) => {
    const resolved = resolveField(field, schema);
    const direction = dir === -1 || dir === 'desc' ? 'DESC' : 'ASC';
    return `${resolved.sqlRef} ${direction} NULLS LAST`;
  });

  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Query Builders
// ---------------------------------------------------------------------------

/**
 * Build a SELECT query.
 * @param {string} table
 * @param {Object} selector
 * @param {Object} options - { sort, skip, limit }
 * @param {import('./schema').ResolvedSchema|null} schema
 * @returns {{ text: string, values: any[] }}
 */
export function buildSelectQuery(table, selector, options, schema) {
  const { text: whereText, values } = compileSelector(selector, schema);
  const ctx = { values: [...values], paramCount: values.length };

  let sql = `SELECT * FROM ${quoteIdent(table)} WHERE ${whereText}`;

  if (options && options.sort) {
    const orderBy = compileSort(options.sort, schema);
    if (orderBy) sql += ` ORDER BY ${orderBy}`;
  }

  if (options && options.limit !== undefined && options.limit !== null) {
    const idx = ctx.values.length + 1;
    ctx.values.push(options.limit);
    sql += ` LIMIT $${idx}`;
  }

  if (options && options.skip) {
    const idx = ctx.values.length + 1;
    ctx.values.push(options.skip);
    sql += ` OFFSET $${idx}`;
  }

  return { text: sql, values: ctx.values };
}

/**
 * Build an INSERT query.
 * @param {string} table
 * @param {Object} doc
 * @param {import('./schema').ResolvedSchema|null} schema
 * @returns {{ text: string, values: any[] }}
 */
export function buildInsertQuery(table, doc, schema) {
  const row = documentToRow(doc, schema);
  const columns = [];
  const placeholders = [];
  const values = [];
  let idx = 0;

  // Always include _id
  if (row._id) {
    idx++;
    columns.push('_id');
    placeholders.push(`$${idx}`);
    values.push(row._id);
  }

  // Schema columns
  if (schema) {
    for (const colName of schema.getColumnNames()) {
      if (row[colName] !== undefined) {
        idx++;
        columns.push(quoteIdent(colName));
        placeholders.push(`$${idx}`);
        values.push(row[colName]);
      }
    }
  }

  // _extra
  if (row._extra && Object.keys(row._extra).length > 0) {
    idx++;
    columns.push('_extra');
    placeholders.push(`$${idx}`);
    values.push(row._extra);
  }

  const sql = `INSERT INTO ${quoteIdent(table)} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING _id`;
  return { text: sql, values };
}

/**
 * Build an UPDATE query.
 * @param {string} table
 * @param {Object} selector
 * @param {Object} modifier
 * @param {Object} options - { multi }
 * @param {import('./schema').ResolvedSchema|null} schema
 * @returns {{ text: string, values: any[], needsFetchModifyWrite: boolean, fetchModifyWriteOps: string[] }}
 */
export function buildUpdateQuery(table, selector, modifier, options, schema) {
  const { setClauses, values: modValues, needsFetchModifyWrite, fetchModifyWriteOps } = compileModifier(modifier, schema);

  if (needsFetchModifyWrite || setClauses.length === 0) {
    // Caller must handle this via transaction
    return { text: null, values: [], needsFetchModifyWrite: true, fetchModifyWriteOps };
  }

  const { text: whereText, values: whereValues } = compileSelector(selector, schema);

  // Rebase where parameter indices to account for modifier params
  const rebasedWhere = rebaseParams(whereText, modValues.length);
  const allValues = [...modValues, ...whereValues];

  let sql;
  if (options && options.multi) {
    sql = `UPDATE ${quoteIdent(table)} SET ${setClauses.join(', ')} WHERE ${rebasedWhere}`;
  } else {
    // Non-multi: update only the first matching row
    sql = `UPDATE ${quoteIdent(table)} SET ${setClauses.join(', ')} WHERE _id = (SELECT _id FROM ${quoteIdent(table)} WHERE ${rebasedWhere} LIMIT 1)`;
  }

  return { text: sql, values: allValues, needsFetchModifyWrite: false, fetchModifyWriteOps: [] };
}

/**
 * Build a DELETE query.
 * @param {string} table
 * @param {Object} selector
 * @param {import('./schema').ResolvedSchema|null} schema
 * @returns {{ text: string, values: any[] }}
 */
export function buildDeleteQuery(table, selector, schema) {
  const { text: whereText, values } = compileSelector(selector, schema);
  const sql = `DELETE FROM ${quoteIdent(table)} WHERE ${whereText}`;
  return { text: sql, values };
}

/**
 * Build an UPSERT query (INSERT ... ON CONFLICT DO UPDATE).
 * @param {string} table
 * @param {Object} selector
 * @param {Object} modifier
 * @param {import('./schema').ResolvedSchema|null} schema
 * @returns {{ text: string, values: any[] }}
 */
export function buildUpsertQuery(table, selector, modifier, schema) {
  // For upsert, we need to construct the initial doc from selector + modifier
  // This is complex — we build the insert part from the selector,
  // then use ON CONFLICT to apply the modifier as an update

  const { setClauses, values: modValues } = compileModifier(modifier, schema);

  // Build the insert portion from selector fields
  const insertDoc = {};
  if (typeof selector === 'object' && selector !== null) {
    for (const [key, value] of Object.entries(selector)) {
      if (!key.startsWith('$') && typeof value !== 'object') {
        insertDoc[key] = value;
      }
    }
  }

  if (!insertDoc._id) {
    insertDoc._id = Random.id();
  }

  // Apply $set fields for the insert case
  if (modifier.$set) {
    Object.assign(insertDoc, modifier.$set);
  }
  if (modifier.$setOnInsert) {
    Object.assign(insertDoc, modifier.$setOnInsert);
  }

  const row = documentToRow(insertDoc, schema);
  const columns = [];
  const placeholders = [];
  const values = [];
  let idx = 0;

  // _id
  if (row._id) {
    idx++;
    columns.push('_id');
    placeholders.push(`$${idx}`);
    values.push(row._id);
  }

  // Schema columns
  if (schema) {
    for (const colName of schema.getColumnNames()) {
      if (row[colName] !== undefined) {
        idx++;
        columns.push(quoteIdent(colName));
        placeholders.push(`$${idx}`);
        values.push(row[colName]);
      }
    }
  }

  // _extra
  if (row._extra && Object.keys(row._extra).length > 0) {
    idx++;
    columns.push('_extra');
    placeholders.push(`$${idx}`);
    values.push(row._extra);
  }

  // Build the ON CONFLICT update part
  // Rebase setClauses params
  const rebasedSetClauses = setClauses.map(clause => rebaseParams(clause, idx));
  const allValues = [...values, ...modValues];

  let sql;
  if (rebasedSetClauses.length > 0) {
    sql = `INSERT INTO ${quoteIdent(table)} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (_id) DO UPDATE SET ${rebasedSetClauses.join(', ')} RETURNING _id`;
  } else {
    sql = `INSERT INTO ${quoteIdent(table)} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (_id) DO NOTHING RETURNING _id`;
  }

  return { text: sql, values: allValues, insertedId: insertDoc._id };
}

/**
 * Rebase $N parameter placeholders by an offset.
 * e.g. rebaseParams('$1 AND $2', 3) → '$4 AND $5'
 */
function rebaseParams(sql, offset) {
  if (offset === 0) return sql;
  return sql.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n) + offset}`);
}
