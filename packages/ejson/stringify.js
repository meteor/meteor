// Based on json2.js from https://github.com/douglascrockford/JSON-js
//
//    json2.js
//    2012-10-08
//
//    Public Domain.
//
//    NO WARRANTY EXPRESSED OR IMPLIED. USE AT YOUR OWN RISK.

function quote(string) {
  return JSON.stringify(string);
}

const str = (key, holder, singleIndent, outerIndent, canonical) => {
  const value = holder[key];

  // What happens next depends on the value's type.
  switch (typeof value) {
  case 'string':
    return quote(value);
  case 'number':
    // JSON numbers must be finite. Encode non-finite numbers as null.
    return isFinite(value) ? String(value) : 'null';
  case 'boolean':
    return String(value);
  // If the type is 'object', we might be dealing with an object or an array or
  // null.
  case 'object':
    // Due to a specification blunder in ECMAScript, typeof null is 'object',
    // so watch out for that case.
    if (!value) {
      return 'null';
    }
    // Make an array to hold the partial results of stringifying this object
    // value.
    const innerIndent = outerIndent + singleIndent;
    const partial = [];

    // Is the value an array?
    if (Array.isArray(value) || ({}).hasOwnProperty.call(value, 'callee')) {
      // The value is an array. Stringify every element. Use null as a
      // placeholder for non-JSON values.
      const length = value.length;
      for (let i = 0; i < length; i += 1) {
        partial[i] =
          str(i, value, singleIndent, innerIndent, canonical) || 'null';
      }

      // Join all of the elements together, separated with commas, and wrap
      // them in brackets.
      let v;
      if (partial.length === 0) {
        v = '[]';
      } else if (innerIndent) {
        v = '[\n' +
          innerIndent +
          partial.join(',\n' +
          innerIndent) +
          '\n' +
          outerIndent +
          ']';
      } else {
        v = '[' + partial.join(',') + ']';
      }
      return v;
    }

    // Iterate through all of the keys in the object.
    let keys = Object.keys(value);
    if (canonical) {
      keys = keys.sort();
    }
    keys.forEach(k => {
      v = str(k, value, singleIndent, innerIndent, canonical);
      if (v) {
        partial.push(quote(k) + (innerIndent ? ': ' : ':') + v);
      }
    });

    // Join all of the member texts together, separated with commas,
    // and wrap them in braces.
    if (partial.length === 0) {
      v = '{}';
    } else if (innerIndent) {
      v = '{\n' +
        innerIndent +
        partial.join(',\n' +
        innerIndent) +
        '\n' +
        outerIndent +
        '}';
    } else {
      v = '{' + partial.join(',') + '}';
    }
    return v;

  default: // Do nothing
  }
};

// If the JSON object does not yet have a stringify method, give it one.
const canonicalStringify = (value, options) => {
  // Make a fake root object containing our value under the key of ''.
  // Return the result of stringifying the value.
  const allOptions = Object.assign({
    indent: '',
    canonical: false,
  }, options);
  if (allOptions.indent === true) {
    allOptions.indent = '  ';
  } else if (typeof allOptions.indent === 'number') {
    let newIndent = '';
    for (let i = 0; i < allOptions.indent; i++) {
      newIndent += ' ';
    }
    allOptions.indent = newIndent;
  }
  return str('', {'': value}, allOptions.indent, '', allOptions.canonical);
};

export default canonicalStringify;
