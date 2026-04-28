import { AST, isAST } from './ast';
import { ParseError } from './errors';
import { pathFromDotted } from './paths';

export function parseSort(raw) {
  if (isAST(raw)) return raw;

  if (Array.isArray(raw)) return parseArrayForm(raw);
  if (raw && typeof raw === 'object') return parseObjectForm(raw);
  if (raw === undefined || raw === null) return { type: AST.SORT, keys: [] };

  throw new ParseError('Sort must be an object or array', raw);
}

function parseArrayForm(arr) {
  const keys = arr.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 2)
      throw new ParseError('Array-form sort entries must be [field, direction]', entry);
    return makeKey(entry[0], entry[1]);
  });
  return { type: AST.SORT, keys };
}

function parseObjectForm(obj) {
  const keys = Object.keys(obj).map((field) => makeKey(field, obj[field]));
  return { type: AST.SORT, keys };
}

function makeKey(field, dir) {
  const path = pathFromDotted(field);
  if (dir === 1 || dir === 'asc')  return { path, direction: 'asc' };
  if (dir === -1 || dir === 'desc') return { path, direction: 'desc' };
  if (dir && typeof dir === 'object' && dir.$meta) {
    return { path, direction: 'meta', metaField: dir.$meta };
  }
  throw new ParseError(`Invalid sort direction for '${field}': ${dir}`, dir);
}
