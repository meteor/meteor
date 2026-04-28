/**
 * Canonical field-path utilities used by afs's query parsers and
 * adapter walkers. Paths are always represented as `string[]`
 * (`['a', 'b', '0', 'c']`) once parsed; the dotted form is only used
 * at the input boundary.
 */

export function pathFromDotted(dotted) {
  if (typeof dotted !== 'string') {
    throw new TypeError(`pathFromDotted expects a string, got ${typeof dotted}`);
  }
  if (dotted === '') return [];
  return dotted.split('.');
}

export function pathToDotted(segments) {
  if (!Array.isArray(segments)) {
    throw new TypeError('pathToDotted expects an array of strings');
  }
  return segments.join('.');
}

const NUMERIC_RE = /^(?:0|[1-9][0-9]*)$/;

export function isNumericSegment(segment) {
  return typeof segment === 'string' && NUMERIC_RE.test(segment);
}
