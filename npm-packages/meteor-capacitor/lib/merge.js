/**
 * @module merge
 * @description Small recursive deep-merge for plain objects:
 *
 *   - Plain object × plain object → recurse.
 *   - Anything else → right-hand side wins (later wins).
 *
 * Arrays replace rather than concatenate. None of capacitor's standard
 * fields are arrays, so this matches user expectation.
 */

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepMerge(a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) return b;
  const out = { ...a };
  for (const key of Object.keys(b)) {
    out[key] = isPlainObject(a[key]) && isPlainObject(b[key])
      ? deepMerge(a[key], b[key])
      : b[key];
  }
  return out;
}

module.exports = { isPlainObject, deepMerge };
