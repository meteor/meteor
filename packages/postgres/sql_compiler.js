/**
 * SQL Compiler — Schema-aware compilation of MongoDB-style selectors,
 * modifiers, and sort specs into parameterized PostgreSQL SQL.
 *
 * All compilers route through resolveField() to determine whether
 * a field targets a native column, JSONB path, or _extra overflow.
 */

import { resolveField, quoteIdent, quoteLiteral, quoteTextArray } from './schema';
import { documentToRow } from './row_converter';

// ---------------------------------------------------------------------------
// Security helpers
// ---------------------------------------------------------------------------

// Prototype-pollution guard: reject any field path whose top-level key or
// dotted segment is a reserved prototype-bearing name. Applied at every
// boundary where a user-supplied key becomes part of a SQL identifier or
// a JSONB path.
const UNSAFE_KEY_RE = /(?:^|\.)(?:__proto__|constructor|prototype)(?:\.|$)/;
function assertSafeFieldPath(path) {
  if (typeof path !== 'string' || UNSAFE_KEY_RE.test(path)) {
    throw new Error(`Postgres SQL compiler: unsafe field path '${path}'`);
  }
}

// Hard cap on $regex source length. Postgres regex evaluation is server-side
// CPU time; patterns are expected to be server-trusted (validated by the
// publish/method handler), but we impose a ceiling as defense-in-depth
// against accidental overruns and to make accidental ReDoS harder to
// trigger. Raise via METEOR_POSTGRES_MAX_REGEX_LENGTH if you have a
// legitimate long pattern.
const DEFAULT_MAX_REGEX_LENGTH = 1000;
function maxRegexLength() {
  const n = parseInt(process.env.METEOR_POSTGRES_MAX_REGEX_LENGTH, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_REGEX_LENGTH;
}

// PCRE-vs-POSIX-ERE divergence guard: Postgres `~`/`~*` use POSIX ERE,
// which silently diverges from JavaScript's PCRE on several constructs.
// Fail loudly instead of executing a different regex than the caller
// wrote.
//
// Note: `$regex` must come from a server-trusted source. Accepting
// arbitrary regex strings from an untrusted network input is a DoS vector
// regardless of the guards below — the regex engine will happily accept
// patterns that these quick checks don't flag but that still exhibit
// exponential backtracking. If you need to accept user regex, validate
// against an explicit allowlist at the method boundary before this point.
function assertPosixRegex(source) {
  if (typeof source !== 'string') return;

  const cap = maxRegexLength();
  if (source.length > cap) {
    throw new Error(
      `Postgres SQL compiler: $regex source is ${source.length} chars, exceeds cap of ${cap}. ` +
      `Regex must come from server-trusted input; raise METEOR_POSTGRES_MAX_REGEX_LENGTH if needed.`
    );
  }

  // Best-effort nested-quantifier ReDoS check: catches patterns like
  // `(a+)+`, `(.*)*`, `(\w{1,})+` where an inner quantifier is wrapped in
  // a group that is itself quantified. This does NOT catch every
  // exponential-backtracking pattern (alternation overlap, nested
  // alternations, etc.) — it's a cheap trip-wire, not a proof of safety.
  if (/\([^()]*[+*][^()]*\)\s*[+*]/.test(source) ||
      /\([^()]*\{[^{}]*\}[^()]*\)\s*[+*]/.test(source)) {
    throw new Error(
      `Postgres SQL compiler: $regex pattern '${source}' contains a ` +
      `nested-quantifier construct associated with exponential backtracking (ReDoS). ` +
      `Rewrite the pattern or use an anchored/atomic equivalent.`
    );
  }

  // Inline flags like `(?i)` at the start of the pattern.
  const inlineFlag = source.match(/^\(\?[imsx]\)/);
  if (inlineFlag) {
    throw new Error(
      `Postgres SQL compiler: $regex uses PCRE construct '${inlineFlag[0]}' ` +
      `that Postgres POSIX regex does not support. ` +
      `Rewrite using POSIX classes (e.g. [[:digit:]] for \\d).`
    );
  }

  // Lookarounds.
  const lookaround = source.match(/\(\?<?[=!]/);
  if (lookaround) {
    throw new Error(
      `Postgres SQL compiler: $regex uses PCRE construct '${lookaround[0]}' ` +
      `that Postgres POSIX regex does not support. ` +
      `Rewrite using POSIX classes (e.g. [[:digit:]] for \\d).`
    );
  }

  // Character-class shortcuts \d \D \w \W \s \S. Walk the string so an
  // even run of backslashes (e.g. `\\d`, which is a literal `\` followed
  // by `d`) is not treated as a shortcut.
  let i = 0;
  while (i < source.length) {
    if (source[i] !== '\\') { i++; continue; }
    // Count the consecutive backslash run starting at i.
    let run = 0;
    while (i + run < source.length && source[i + run] === '\\') run++;
    const afterRun = source[i + run];
    if (run % 2 === 1 && afterRun && /[dDwWsS]/.test(afterRun)) {
      throw new Error(
        `Postgres SQL compiler: $regex uses PCRE construct '\\${afterRun}' ` +
        `that Postgres POSIX regex does not support. ` +
        `Rewrite using POSIX classes (e.g. [[:digit:]] for \\d).`
      );
    }
    // Skip the run and the escaped character (if any).
    i += run + (afterRun ? 1 : 0);
  }
}

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
      assertSafeFieldPath(key);
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

  // Pre-scan for $options so it can be folded into the adjacent $regex.
  // Mongo treats `{ $regex: '...', $options: 'i' }` as a single match; we
  // must pass the flag string through to the $regex handler because it
  // only inspects `operand.flags` for RegExp operands, not sibling keys.
  const extraOptions = typeof value.$options === 'string' ? value.$options : '';

  // Compile each operator
  const opClauses = [];
  for (const [op, operand] of Object.entries(value)) {
    opClauses.push(compileOperator(resolved, op, operand, fieldPath, schema, ctx, extraOptions));
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
        ? `NOT (${quotedTop} ? ${quoteLiteral(resolved.jsonPath[0])})`
        : `${quotedTop} ? ${quoteLiteral(resolved.jsonPath[0])}`;
    }
    return isNull ? `${sqlRef} IS NULL` : `${sqlRef} IS NOT NULL`;
  }
  if (kind === 'extra' || kind === 'extra_path') {
    if (kind === 'extra') {
      return isNull
        ? `NOT (_extra ? ${quoteLiteral(topLevelField)})`
        : `_extra ? ${quoteLiteral(topLevelField)}`;
    }
    return isNull ? `${sqlRef} IS NULL` : `${sqlRef} IS NOT NULL`;
  }

  return isNull ? `${sqlRef} IS NULL` : `${sqlRef} IS NOT NULL`;
}

function compileOperator(resolved, op, operand, fieldPath, schema, ctx, extraOptions = '') {
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
          parts.push(compileJsonbInClause(resolved, nonNull, ctx, false));
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
          parts.push(`NOT (${compileJsonbInClause(resolved, nonNull, ctx, false)})`);
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

      // Fold in $options from the parent operator object (Fix I-2).
      // Mongo's `{ $regex: '...', $options: 'i' }` surfaces here: flags
      // from a RegExp operand and the sibling $options string are unioned.
      if (extraOptions) {
        for (const ch of extraOptions) {
          if (!flags.includes(ch)) flags += ch;
        }
      }

      // Reject PCRE constructs Postgres POSIX ERE does not support (Fix I-1).
      assertPosixRegex(pattern);

      const caseInsensitive = flags.includes('i');
      const regexOp = caseInsensitive ? '~*' : '~';

      const param = ctx.addParam(pattern);
      return `${sqlRef} ${regexOp} ${param}`;
    }

    case '$options':
      // Consumed alongside $regex (see extraOptions folding above). A
      // bare $options with no adjacent $regex is a no-op.
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
      // $not wraps another operator. Guard against null operand: a bare
      // `{ field: { $not: null } }` is meaningless in Mongo (there's no
      // operator to invert) and dereferencing operand.$options on null
      // would throw.
      if (operand === null || operand === undefined) {
        throw new Error('$not requires an operator object or a RegExp, not null/undefined');
      }
      if (typeof operand === 'object' && !(operand instanceof RegExp)) {
        const innerOptions = typeof operand.$options === 'string' ? operand.$options : '';
        const inner = [];
        for (const [innerOp, innerVal] of Object.entries(operand)) {
          if (innerOp === '$options') continue;
          inner.push(compileOperator(resolved, innerOp, innerVal, fieldPath, schema, ctx, innerOptions));
        }
        return `NOT (${inner.join(' AND ')})`;
      }
      // $not with a regex
      if (operand instanceof RegExp) {
        const pattern = operand.source;
        assertPosixRegex(pattern);
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
        ? `_extra->${quoteLiteral(resolved.topLevelField)}`
        : sqlRef;
      const param = ctx.addParam(operand);
      return `jsonb_array_length(${topRef}) = ${param}`;
    }

    case '$elemMatch': {
      // Guard against null / non-object operand before any property access.
      // `{ field: { $elemMatch: null } }` is an error in Mongo too; we fail
      // loudly instead of crashing with TypeError on `operand.$options`.
      if (operand === null || operand === undefined || typeof operand !== 'object') {
        throw new Error(
          `$elemMatch requires an object operand, got ${operand === null ? 'null' : typeof operand}`
        );
      }

      // EXISTS subquery over jsonb_array_elements
      let arrayRef;
      if (kind === 'jsonb_column') {
        arrayRef = sqlRef;
      } else if (kind === 'extra') {
        arrayRef = `_extra->${quoteLiteral(resolved.topLevelField)}`;
      } else {
        throw new Error(`$elemMatch requires a JSONB array field, got ${kind} for ${fieldPath}`);
      }

      const elemOptions = typeof operand.$options === 'string' ? operand.$options : '';
      const innerClauses = [];
      for (const [subKey, subVal] of Object.entries(operand)) {
        if (subKey === '$options') continue;
        if (subKey.startsWith('$')) {
          // Operator on element itself
          innerClauses.push(compileElemOperator('elem', subKey, subVal, ctx, elemOptions));
        } else {
          // Field within array element
          const subRef = `elem->>${quoteLiteral(subKey)}`;
          if (typeof subVal === 'object' && subVal !== null && !Array.isArray(subVal) && !(subVal instanceof Date)) {
            const subOptions = typeof subVal.$options === 'string' ? subVal.$options : '';
            for (const [subOp, subOperand] of Object.entries(subVal)) {
              if (subOp === '$options') continue;
              innerClauses.push(compileElemOperator(subRef, subOp, subOperand, ctx, subOptions));
            }
          } else if (subVal === null || subVal === undefined) {
            // Mongo semantics: match when the array element's key is
            // JSON null or absent. Stringifying `null` to `'null'` would
            // silently match the literal string "null", which is wrong.
            innerClauses.push(
              `(jsonb_typeof(elem->${quoteLiteral(subKey)}) = 'null' ` +
              `OR NOT (elem ? ${quoteLiteral(subKey)}))`
            );
          } else if (typeof subVal === 'number') {
            // Number scalar: cast the extracted text to numeric so `{ score: 5 }`
            // matches JSON `5` and also parses the jsonb representation
            // consistently (e.g. `5.0` vs `5`).
            const param = ctx.addParam(subVal);
            innerClauses.push(`(${subRef})::numeric = ${param}`);
          } else if (typeof subVal === 'boolean') {
            const param = ctx.addParam(subVal);
            innerClauses.push(`(${subRef})::boolean = ${param}`);
          } else if (subVal instanceof Date) {
            const param = ctx.addParam(subVal.toISOString());
            innerClauses.push(`(${subRef})::timestamptz = ${param}::timestamptz`);
          } else {
            const param = ctx.addParam(String(subVal));
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
        return `jsonb_typeof(${sqlRef}) = ${quoteLiteral(pgType)}`;
      }
      if (kind === 'jsonb_path') {
        const quotedTop = quoteIdent(resolved.topLevelField);
        const jsonbRef = resolved.jsonPath.length === 1
          ? `${quotedTop}->${quoteLiteral(resolved.jsonPath[0])}`
          : `${quotedTop} #> ${quoteTextArray(resolved.jsonPath)}`;
        return `jsonb_typeof(${jsonbRef}) = ${quoteLiteral(pgType)}`;
      }
      if (kind === 'extra') {
        return `jsonb_typeof(_extra->${quoteLiteral(resolved.topLevelField)}) = ${quoteLiteral(pgType)}`;
      }
      if (kind === 'extra_path') {
        const parts = fieldPath.split('.');
        return `jsonb_typeof(_extra #> ${quoteTextArray(parts)}) = ${quoteLiteral(pgType)}`;
      }
      throw new Error('$type is only supported on jsonb columns and _extra paths');
    }

    default:
      throw new Error(`Unsupported selector operator: ${op}`);
  }
}

// Single-parameter $in-style clause for JSONB-backed refs. Binds the
// element list as one JSON-array parameter to stay under pg's 65535-param
// cap on large lists.
function compileJsonbInClause(resolved, nonNull, ctx) {
  const { kind, sqlRef } = resolved;
  const sample = nonNull.find(v => v !== undefined && v !== null);
  const serialized = nonNull.map(v => (v instanceof Date ? v.toISOString() : v));
  const param = ctx.addParam(JSON.stringify(serialized));

  let leftExpr;
  if (kind === 'jsonb_column') {
    if (typeof sample === 'number') leftExpr = `(${sqlRef})::numeric`;
    else if (typeof sample === 'boolean') leftExpr = `(${sqlRef})::boolean`;
    else if (sample instanceof Date) leftExpr = `(${sqlRef})::timestamptz`;
    else leftExpr = `${sqlRef}::text`;
  } else {
    if (typeof sample === 'number') leftExpr = `(${sqlRef})::numeric`;
    else if (typeof sample === 'boolean') leftExpr = `(${sqlRef})::boolean`;
    else if (sample instanceof Date) leftExpr = `(${sqlRef})::timestamptz`;
    else leftExpr = sqlRef;
  }

  let rightExpr;
  if (typeof sample === 'number') {
    rightExpr = `SELECT (jsonb_array_elements_text(${param}::jsonb))::numeric`;
  } else if (typeof sample === 'boolean') {
    rightExpr = `SELECT (jsonb_array_elements_text(${param}::jsonb))::boolean`;
  } else if (sample instanceof Date) {
    rightExpr = `SELECT (jsonb_array_elements_text(${param}::jsonb))::timestamptz`;
  } else {
    rightExpr = `SELECT jsonb_array_elements_text(${param}::jsonb)`;
  }

  return `${leftExpr} IN (${rightExpr})`;
}

function compileElemOperator(ref, op, operand, ctx, extraOptions = '') {
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
      let pattern = operand;
      let flags = '';
      if (operand instanceof RegExp) {
        pattern = operand.source;
        flags = operand.flags;
      }
      if (extraOptions) {
        for (const ch of extraOptions) {
          if (!flags.includes(ch)) flags += ch;
        }
      }
      assertPosixRegex(pattern);
      const regexOp = flags.includes('i') ? '~*' : '~';
      const param = ctx.addParam(pattern);
      return `${ref}::text ${regexOp} ${param}`;
    }
    case '$options':
      return 'TRUE';
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
          assertSafeFieldPath(field);
          const clause = compileSet(field, value, schema, ctx);
          if (clause) setClauses.push(clause);
        }
        break;

      case '$unset':
        for (const [field] of Object.entries(fields)) {
          assertSafeFieldPath(field);
          const clause = compileUnset(field, schema, ctx);
          if (clause) setClauses.push(clause);
        }
        break;

      case '$inc':
        for (const [field, value] of Object.entries(fields)) {
          assertSafeFieldPath(field);
          const clause = compileInc(field, value, schema, ctx);
          if (clause) setClauses.push(clause);
        }
        break;

      case '$mul':
        for (const [field, value] of Object.entries(fields)) {
          assertSafeFieldPath(field);
          const clause = compileMul(field, value, schema, ctx);
          if (clause) setClauses.push(clause);
        }
        break;

      case '$min':
        for (const [field, value] of Object.entries(fields)) {
          assertSafeFieldPath(field);
          const clause = compileMin(field, value, schema, ctx);
          if (clause) setClauses.push(clause);
        }
        break;

      case '$max':
        for (const [field, value] of Object.entries(fields)) {
          assertSafeFieldPath(field);
          const clause = compileMax(field, value, schema, ctx);
          if (clause) setClauses.push(clause);
        }
        break;

      case '$currentDate':
        for (const [field] of Object.entries(fields)) {
          assertSafeFieldPath(field);
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
            assertSafeFieldPath(field);
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
    const path = quoteTextArray(resolved.jsonPath);
    const param = ctx.addParam(JSON.stringify(value));
    return `${quotedTop} = jsonb_set(COALESCE(${quotedTop}, '{}'), ${path}, ${param}::jsonb)`;
  }

  if (resolved.kind === 'extra') {
    const param = ctx.addParam(JSON.stringify(value));
    return `_extra = jsonb_set(COALESCE(_extra, '{}'), ${quoteTextArray([resolved.topLevelField])}, ${param}::jsonb)`;
  }

  if (resolved.kind === 'extra_path') {
    const parts = field.split('.');
    const path = quoteTextArray(parts);
    const param = ctx.addParam(JSON.stringify(value));
    return `_extra = jsonb_set(COALESCE(_extra, '{}'), ${path}, ${param}::jsonb)`;
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
      return `${quotedTop} = ${quotedTop} - ${quoteLiteral(resolved.jsonPath[0])}`;
    }
    return `${quotedTop} = ${quotedTop} #- ${quoteTextArray(resolved.jsonPath)}`;
  }

  if (resolved.kind === 'extra') {
    return `_extra = _extra - ${quoteLiteral(resolved.topLevelField)}`;
  }

  if (resolved.kind === 'extra_path') {
    const parts = field.split('.');
    return `_extra = _extra #- ${quoteTextArray(parts)}`;
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
    const path = quoteTextArray(resolved.jsonPath);
    const param = ctx.addParam(value);
    return `${quotedTop} = jsonb_set(COALESCE(${quotedTop}, '{}'), ${path}, to_jsonb(COALESCE((${quotedTop} #>> ${path})::numeric, 0) + ${param}))`;
  }

  if (resolved.kind === 'extra') {
    const param = ctx.addParam(value);
    return `_extra = jsonb_set(COALESCE(_extra, '{}'), ${quoteTextArray([resolved.topLevelField])}, to_jsonb(COALESCE((_extra->>${quoteLiteral(resolved.topLevelField)})::numeric, 0) + ${param}))`;
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
    const path = quoteTextArray(resolved.jsonPath);
    const param = ctx.addParam(value);
    return `${quotedTop} = jsonb_set(COALESCE(${quotedTop}, '{}'), ${path}, to_jsonb(COALESCE((${quotedTop} #>> ${path})::numeric, 0) * ${param}))`;
  }

  if (resolved.kind === 'extra') {
    const param = ctx.addParam(value);
    return `_extra = jsonb_set(COALESCE(_extra, '{}'), ${quoteTextArray([resolved.topLevelField])}, to_jsonb(COALESCE((_extra->>${quoteLiteral(resolved.topLevelField)})::numeric, 0) * ${param}))`;
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
    return `${quotedTop} = jsonb_set(COALESCE(${quotedTop}, '{}'), ${quoteTextArray(resolved.jsonPath)}, to_jsonb(NOW()))`;
  }

  if (resolved.kind === 'extra') {
    return `_extra = jsonb_set(COALESCE(_extra, '{}'), ${quoteTextArray([resolved.topLevelField])}, to_jsonb(NOW()))`;
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
    return `_extra = jsonb_set(COALESCE(_extra, '{}'), ${quoteTextArray([topField])}, COALESCE(_extra->${quoteLiteral(topField)}, '[]'::jsonb) || ${param}::jsonb)`;
  }

  // A regular scalar column (kind === 'column') cannot hold an array.
  // Silently dropping the clause used to hide the mismatch; throw so the
  // caller sees the schema error instead of a successful no-op UPDATE.
  if (resolved.kind === 'column') {
    throw new Error(
      `Postgres SQL compiler: $push requires a JSONB/array column; ` +
      `field "${field}" is a scalar column`
    );
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
    assertSafeFieldPath(field);
    const resolved = resolveField(field, schema);
    const direction = dir === -1 || dir === 'desc' ? 'DESC' : 'ASC';

    // JSONB text-extraction (->>) returns text, so ORDER BY produces
    // lexicographic order. "10" < "2" lexicographically — silently wrong for
    // numeric fields. Users hint the intended type via a schema sort-hint
    // map, e.g. `new ResolvedSchema({...}, { sortHints: { 'meta.score': 'number' } })`.
    // If no hint is provided, fall back to text ordering (the legacy behavior)
    // rather than guessing — a wrong guess is worse than a known-wrong default.
    const hintedType =
      schema && typeof schema.getSortHint === 'function'
        ? schema.getSortHint(field)
        : null;

    let expr = resolved.sqlRef;
    if (
      (resolved.kind === 'jsonb_path' ||
        resolved.kind === 'extra' ||
        resolved.kind === 'extra_path') &&
      hintedType
    ) {
      if (hintedType === 'number' || hintedType === 'numeric') {
        expr = `(${resolved.sqlRef})::numeric`;
      } else if (hintedType === 'date' || hintedType === 'timestamp') {
        expr = `(${resolved.sqlRef})::timestamptz`;
      } else if (hintedType === 'boolean') {
        expr = `(${resolved.sqlRef})::boolean`;
      }
      // 'text' / 'string' / unknown → leave as-is.
    }

    return `${expr} ${direction} NULLS LAST`;
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

  const projection = ['_id'];
  if (schema) {
    for (const colName of schema.getColumnNames()) projection.push(colName);
  }
  projection.push('_extra');
  const projectionSql = projection.map(c => quoteIdent(c)).join(', ');

  let sql = `SELECT ${projectionSql} FROM ${quoteIdent(table)} WHERE ${whereText}`;

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
      } else {
        const col = schema.getColumn(colName);
        if (col && col.required && col.default === undefined) {
          throw new Error(`Required field "${colName}" is missing`);
        }
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
    // Non-multi: update only the first matching row. Without an ORDER BY
    // the LIMIT 1 subquery picks an arbitrary row — Mongo promises
    // deterministic ordering, either from the caller's `sort` option or
    // (by default) the oldest `_id`.
    let orderBy;
    if (options && options.sort) {
      orderBy = compileSort(options.sort, schema);
    }
    if (!orderBy) orderBy = `${quoteIdent('_id')} ASC`;
    sql = `UPDATE ${quoteIdent(table)} SET ${setClauses.join(', ')} WHERE _id = (SELECT _id FROM ${quoteIdent(table)} WHERE ${rebasedWhere} ORDER BY ${orderBy} LIMIT 1)`;
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
 * Build an UPSERT query.
 *
 * Two strategies depending on whether the selector carries a concrete `_id`:
 *
 * 1. Selector has `_id`: emit `INSERT ... ON CONFLICT(_id) DO UPDATE`.
 *    The primary-key conflict path is correct and atomic.
 *
 * 2. Selector has NO `_id` (e.g. `{ slug: 'foo' }`): the old code generated
 *    a fresh `Random.id()` and used `ON CONFLICT(_id) DO UPDATE`. The fresh
 *    id never conflicts, so every call inserted a new row — the exact bug
 *    we're fixing here.
 *
 *    The fix: emit a single atomic CTE that UPDATEs the first matching row
 *    (by selector WHERE) if one exists, otherwise INSERTs a new row with a
 *    fresh `_id` derived from selector + modifier fields. The CTE produces
 *    exactly one output row so the caller's existing
 *    `{ text, values, insertedId }` contract is preserved — the caller can
 *    detect insert-vs-update by comparing the returned `_id` against
 *    `insertedId`.
 *
 * The CTE form (non-`_id` selector):
 *
 *   WITH updated AS (
 *     UPDATE <table> SET <setClauses>
 *     WHERE _id = (SELECT _id FROM <table> WHERE <sel> LIMIT 1)
 *     RETURNING _id
 *   ), inserted AS (
 *     INSERT INTO <table> (<cols>) SELECT <vals>
 *     WHERE NOT EXISTS (SELECT 1 FROM updated)
 *     RETURNING _id
 *   )
 *   SELECT _id FROM updated UNION ALL SELECT _id FROM inserted
 *
 * `RETURNING _id` from the INSERT yields the freshly generated id, matching
 * `insertedId`. The UPDATE returns the pre-existing `_id`, which differs
 * from `insertedId`, so the caller correctly reports `insertedId: undefined`
 * for update-in-place.
 *
 * @param {string} table
 * @param {Object} selector
 * @param {Object} modifier
 * @param {import('./schema').ResolvedSchema|null} schema
 * @returns {{ text: string, values: any[], insertedId: string }}
 */
export function buildUpsertQuery(table, selector, modifier, schema) {
  const { setClauses, values: modValues } = compileModifier(modifier, schema);

  // Build the would-be-inserted doc from selector + modifier fields.
  // Only scalar selector fields are eligible (selector can contain operator
  // objects like { $gt: 5 } that must not leak into the inserted row).
  const insertDoc = Object.create(null);
  if (typeof selector === 'object' && selector !== null) {
    for (const [key, value] of Object.entries(selector)) {
      if (key.startsWith('$')) continue;
      assertSafeFieldPath(key);
      if (value === null || value === undefined) continue;
      if (typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
        // Operator object (e.g. { $gt: 5 }) or plain object — skip.
        const subKeys = Object.keys(value);
        if (subKeys.length > 0 && subKeys.every(k => k.startsWith('$'))) continue;
      }
      insertDoc[key] = value;
    }
  }

  const hasIdInSelector = !!insertDoc._id;
  if (!hasIdInSelector) {
    insertDoc._id = Random.id();
  }

  // Apply $set / $setOnInsert for the insert case so the new row starts
  // with modifier-supplied values. Guard each key against prototype
  // pollution before copying — Object.assign would otherwise let a
  // crafted key like "__proto__" poison the prototype chain.
  if (modifier.$set) {
    for (const [k, v] of Object.entries(modifier.$set)) {
      assertSafeFieldPath(k);
      insertDoc[k] = v;
    }
  }
  if (modifier.$setOnInsert) {
    for (const [k, v] of Object.entries(modifier.$setOnInsert)) {
      assertSafeFieldPath(k);
      insertDoc[k] = v;
    }
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
      } else {
        const col = schema.getColumn(colName);
        if (col && col.required && col.default === undefined) {
          throw new Error(`Required field "${colName}" is missing`);
        }
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

  const insertedId = insertDoc._id;
  const quotedTable = quoteIdent(table);

  if (hasIdInSelector) {
    // Primary-key conflict path — preserved from the original implementation.
    const rebasedSetClauses = setClauses.map(clause => rebaseParams(clause, idx));
    const allValues = [...values, ...modValues];

    let sql;
    if (rebasedSetClauses.length > 0) {
      sql = `INSERT INTO ${quotedTable} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (_id) DO UPDATE SET ${rebasedSetClauses.join(', ')} RETURNING _id, (xmax = 0) AS "__inserted"`;
    } else {
      sql = `INSERT INTO ${quotedTable} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT (_id) DO NOTHING RETURNING _id, TRUE AS "__inserted"`;
    }

    return { text: sql, values: allValues, insertedId };
  }

  // Non-`_id` selector: CTE that UPDATEs if a row matches, else INSERTs.
  // Parameter layout: insertValues ($1..$idx), then modValues, then
  // selector WHERE values.
  const insertValuesCount = idx;
  const rebasedSetClauses = setClauses.map(clause => rebaseParams(clause, insertValuesCount));

  const { text: whereText, values: whereValues } = compileSelector(selector, schema);
  const rebasedWhere = rebaseParams(whereText, insertValuesCount + modValues.length);

  const allValues = [...values, ...modValues, ...whereValues];

  // If modifier has no emittable SET clauses (e.g. fetch-modify-write
  // operators only), we still need a legal UPDATE. Fall back to updating
  // `_id = _id` which is a no-op that still registers a rowCount. That
  // shouldn't actually happen because callers that need fetch-modify-write
  // don't route through buildUpsertQuery, but we guard defensively.
  const setSql = rebasedSetClauses.length > 0
    ? rebasedSetClauses.join(', ')
    : '_id = _id';

  const sql =
    `WITH updated AS (` +
      `UPDATE ${quotedTable} SET ${setSql} ` +
      `WHERE _id = (SELECT _id FROM ${quotedTable} WHERE ${rebasedWhere} ORDER BY ${quoteIdent('_id')} ASC LIMIT 1) ` +
      `RETURNING _id, FALSE AS "__inserted"` +
    `), inserted AS (` +
      `INSERT INTO ${quotedTable} (${columns.join(', ')}) ` +
      `SELECT ${placeholders.join(', ')} ` +
      `WHERE NOT EXISTS (SELECT 1 FROM updated) ` +
      `RETURNING _id, TRUE AS "__inserted"` +
    `) ` +
    `SELECT _id, "__inserted" FROM updated UNION ALL SELECT _id, "__inserted" FROM inserted`;

  return { text: sql, values: allValues, insertedId };
}

/**
 * Rebase $N parameter placeholders by an offset.
 * e.g. rebaseParams('$1 AND $2', 3) → '$4 AND $5'
 *
 * Skips single-quoted string spans so inlined literals containing `$N`
 * (e.g. user-controlled field names routed through quoteLiteral) are not
 * rewritten. Postgres escapes an inner quote by doubling it (`''`).
 */
function rebaseParams(sql, offset) {
  if (offset === 0) return sql;
  let out = '';
  let i = 0;
  let inLiteral = false;
  while (i < sql.length) {
    const ch = sql[i];
    if (inLiteral) {
      out += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") { out += "'"; i += 2; continue; }
        inLiteral = false;
      }
      i++;
      continue;
    }
    if (ch === "'") {
      out += ch;
      inLiteral = true;
      i++;
      continue;
    }
    if (ch === '$') {
      let j = i + 1;
      while (j < sql.length && sql[j] >= '0' && sql[j] <= '9') j++;
      if (j > i + 1) {
        const n = parseInt(sql.slice(i + 1, j), 10);
        out += `$${n + offset}`;
        i = j;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}
