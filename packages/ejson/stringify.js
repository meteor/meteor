// Based on json2.js from https://github.com/douglascrockford/JSON-js
//
//    json2.js
//    2012-10-08
//
//    Public Domain.
//
//    NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.

// Cached references
const { hasOwnProperty } = Object.prototype;
const arrayIsArray = Array.isArray;
const quote = JSON.stringify;

function canonicalStringify(value, options = {}) {
  // Normalize options
  let { indent = '', canonical = false } = options;
  if (indent === true) {
    indent = '  ';
  } else if (typeof indent === 'number') {
    indent = ' '.repeat(indent);
  }

  // The main recursive serializer
  function serialize(val, depth) {
    const type = typeof val;

    // Primitives
    if (type === 'string') {
      return quote(val);
    }
    if (type === 'number') {
      return isFinite(val) ? String(val) : 'null';
    }
    if (type === 'boolean') {
      return String(val);
    }
    if (val == null) { // handles null & undefined
      return 'null';
    }

    // Objects & Arrays
    if (type === 'object') {
      // Array (or old-style arguments object)
      if (arrayIsArray(val) || hasOwnProperty.call(val, 'callee')) {
        const len = val.length;
        if (len === 0) {
          return '[]';
        }

        // Build each element
        const items = new Array(len);
        for (let i = 0; i < len; i++) {
          const item = serialize(val[i], depth + 1);
          items[i] = item != null ? item : 'null';
        }

        // Compact vs. pretty print
        if (!indent) {
          return '[' + items.join(',') + ']';
        }

        const outer = indent.repeat(depth);
        const inner = indent.repeat(depth + 1);
        return (
          '[\n' +
          inner +
          items.join(',\n' + inner) +
          '\n' +
          outer +
          ']'
        );
      }

      // Plain object
      let keys = Object.keys(val);
      if (canonical) {
        keys.sort();
      }

      const parts = [];
      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (!hasOwnProperty.call(val, key)) continue;

        const v = serialize(val[key], depth + 1);
        if (v != null) {
          const k = quote(key);

          if (indent) {
            const inner = indent.repeat(depth + 1);
            parts.push(inner + k + ': ' + v);
          } else {
            parts.push(k + ':' + v);
          }
        }
      }

      if (parts.length === 0) {
        return '{}';
      }
      if (!indent) {
        return '{' + parts.join(',') + '}';
      }

      const outer = indent.repeat(depth);
      return '{\n' + parts.join(',\n') + '\n' + outer + '}';
    }

    // Functions, symbols, etc. are skipped (per JSON spec)
    return undefined;
  }

  // Kick off serialization at depth 0
  return serialize(value, 0);
}

export default canonicalStringify;