import { AST, isAST } from './ast';
import { ParseError } from './errors';
import { pathFromDotted } from './paths';
import { parseSelector } from './parse-selector';

export function parseProjection(raw) {
  if (isAST(raw)) return raw;
  if (raw === undefined || raw === null) {
    return { type: AST.PROJECTION, mode: 'include', fields: [{ path: ['_id'], include: true }] };
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ParseError('Projection must be an object', raw);
  }

  const fields = [];
  let sawInclude = false, sawExclude = false, hasIdSpec = false;

  for (const f of Object.keys(raw)) {
    const value = raw[f];
    const path = pathFromDotted(f);
    if (path[0] === '_id') hasIdSpec = true;

    if (value === 1 || value === true) {
      if (path[0] !== '_id') sawInclude = true;
      fields.push({ path, include: true });
    } else if (value === 0 || value === false) {
      if (path[0] !== '_id') sawExclude = true;
      fields.push({ path, include: false });
    } else if (value && typeof value === 'object') {
      if ('$slice' in value) {
        const s = value.$slice;
        const slice = Array.isArray(s)
          ? { skip: s[0], limit: s[1] }
          : { limit: s };
        fields.push({ path, slice });
        sawInclude = true;
      } else if ('$elemMatch' in value) {
        fields.push({ path, elemMatch: parseSelector(value.$elemMatch) });
        sawInclude = true;
      } else {
        throw new ParseError(`Invalid projection operand for '${f}'`, value);
      }
    } else {
      throw new ParseError(`Invalid projection operand for '${f}'`, value);
    }
  }

  if (sawInclude && sawExclude) {
    throw new ParseError('Cannot mix include and exclude in same projection (other than _id)', raw);
  }

  let mode;
  if (hasIdSpec && (sawInclude || sawExclude)) {
    mode = 'mixed';
  } else if (sawExclude) {
    mode = 'exclude';
  } else {
    mode = 'include';
    if (!hasIdSpec) {
      // _id is included by default in include-mode projections.
      fields.unshift({ path: ['_id'], include: true });
    }
  }

  return { type: AST.PROJECTION, mode, fields };
}
