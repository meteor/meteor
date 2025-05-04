import {
  isFunction,
  isObject,
  lengthOf,
  hasOwn,
  convertMapToObject,
  isArguments,
  isInfOrNaN,
  handleError,
} from './utils';

// Cache frequently used globals
const arrayIsArray = Array.isArray;
const objKeys = Object.keys;
const noYields = Meteor._noYieldsAllowed;
const base64Encode = Base64.encode;
const base64Decode = Base64.decode;
const Base64NewBinary = Base64.newBinary;

// Custom‐type registry
const customTypes = new Map();

// The EJSON namespace
export const EJSON = Object.create(null);

// ------ Custom Type API ------

EJSON.addType = (name, factory) => {
  if (customTypes.has(name)) {
    throw new Error(`Type ${name} already present`);
  }
  customTypes.set(name, factory);
};

EJSON._isCustomType = obj =>
  obj &&
  isFunction(obj.toJSONValue) &&
  isFunction(obj.typeName) &&
  customTypes.has(obj.typeName());

EJSON._getTypes = isOriginal =>
  isOriginal ? customTypes : convertMapToObject(customTypes);

EJSON._getConverters = () => builtinConverters;

// ------ Builtin Converters ------

const builtinConverters = [
  // Date
  {
    matchJSONValue: o => hasOwn(o, '$date') && lengthOf(o) === 1,
    matchObject: o => o instanceof Date,
    toJSONValue: d => ({ $date: d.getTime() }),
    fromJSONValue: o => new Date(o.$date),
  },
  // RegExp
  {
    matchJSONValue: o =>
      hasOwn(o, '$regexp') &&
      hasOwn(o, '$flags') &&
      lengthOf(o) === 2,
    matchObject: o => o instanceof RegExp,
    toJSONValue: r => ({ $regexp: r.source, $flags: r.flags }),
    fromJSONValue: o => {
      const flags = o.$flags
        .slice(0, 50)
        .replace(/[^gimuy]/g, '')
        .replace(/(.)(?=.*\1)/g, '');
      return new RegExp(o.$regexp, flags);
    },
  },
  // NaN / ±Inf
  {
    matchJSONValue: o => hasOwn(o, '$InfNaN') && lengthOf(o) === 1,
    matchObject: isInfOrNaN,
    toJSONValue: v => {
      const sign = Number.isNaN(v) ? 0 : v === Infinity ? 1 : -1;
      return { $InfNaN: sign };
    },
    fromJSONValue: o => o.$InfNaN / 0,
  },
  // Binary
  {
    matchJSONValue: o => hasOwn(o, '$binary') && lengthOf(o) === 1,
    matchObject: o =>
      (typeof Uint8Array !== 'undefined' && o instanceof Uint8Array) ||
      (o && hasOwn(o, '$Uint8ArrayPolyfill')),
    toJSONValue: o => ({ $binary: base64Encode(o) }),
    fromJSONValue: o => base64Decode(o.$binary),
  },
  // Escape wrapper
  {
    matchJSONValue: o => hasOwn(o, '$escape') && lengthOf(o) === 1,
    matchObject: o => {
      if (!o) return false;
      const k = objKeys(o);
      if (k.length !== 1 && k.length !== 2) return false;
      // If it would match any other converter's JSON form
      for (let i = 0; i < builtinConverters.length; i++) {
        if (builtinConverters[i].matchJSONValue(o)) return false;
      }
      return true;
    },
    toJSONValue: o => {
      const e = o.$escape || o;
      const res = Object.create(null);
      const k = objKeys(e);
      for (let i = 0; i < k.length; i++) {
        res[k[i]] = EJSON.toJSONValue(e[k[i]]);
      }
      return { $escape: res };
    },
    fromJSONValue: o => {
      const e = o.$escape;
      const res = Object.create(null);
      const k = objKeys(e);
      for (let i = 0; i < k.length; i++) {
        res[k[i]] = EJSON.fromJSONValue(e[k[i]]);
      }
      return res;
    },
  },
  // Custom
  {
    matchJSONValue: o =>
      hasOwn(o, '$type') && hasOwn(o, '$value') && lengthOf(o) === 2,
    matchObject: o => EJSON._isCustomType(o),
    toJSONValue: o => ({
      $type: o.typeName(),
      $value: noYields(() => o.toJSONValue()),
    }),
    fromJSONValue: o => {
      const name = o.$type;
      if (!customTypes.has(name)) {
        throw new Error(`Custom EJSON type ${name} is not defined`);
      }
      return noYields(() => customTypes.get(name)(o.$value));
    },
  },
];

// ------ Helpers for JSON conversion ------

function toJSONValueHelper(item) {
  for (let i = 0; i < builtinConverters.length; i++) {
    const c = builtinConverters[i];
    if (c.matchObject(item)) {
      return c.toJSONValue(item);
    }
  }
  return undefined;
}

function adjustTypesToJSONValue(obj) {
  if (obj === null) return null;
  const changed = toJSONValueHelper(obj);
  if (changed !== undefined) return changed;
  if (!isObject(obj)) return obj;

  const k = objKeys(obj);
  for (let i = 0; i < k.length; i++) {
    const key = k[i];
    const val = obj[key];
    if ((val === undefined) || (!isObject(val) && !isInfOrNaN(val))) continue;

    const cv = toJSONValueHelper(val);
    if (cv !== undefined) {
      obj[key] = cv;
    } else {
      adjustTypesToJSONValue(val);
    }
  }
  return obj;
}

EJSON._adjustTypesToJSONValue = adjustTypesToJSONValue;

EJSON.toJSONValue = item => {
  const top = toJSONValueHelper(item);
  if (top !== undefined) return top;
  if (!isObject(item)) return item;

  const copy = EJSON.clone(item);
  adjustTypesToJSONValue(copy);
  return copy;
};

// ------ Helpers for JSON → EJSON deserialization ------

function fromJSONValueHelper(value) {
  if (!isObject(value) || value === null) return value;
  const k = objKeys(value);
  if (k.length > 2) return value;

  for (let i = 0; i < builtinConverters.length; i++) {
    if (builtinConverters[i].matchJSONValue(value)) {
      return builtinConverters[i].fromJSONValue(value);
    }
  }
  return value;
}

function adjustTypesFromJSONValue(obj) {
  if (obj === null) return null;
  const top = fromJSONValueHelper(obj);
  if (top !== obj) return top;
  if (!isObject(obj)) return obj;

  const k = objKeys(obj);
  for (let i = 0; i < k.length; i++) {
    const key = k[i];
    const val = obj[key];
    if (isObject(val)) {
      const cv = fromJSONValueHelper(val);
      if (cv !== val) {
        obj[key] = cv;
      } else {
        adjustTypesFromJSONValue(val);
      }
    }
  }
  return obj;
}

EJSON._adjustTypesFromJSONValue = adjustTypesFromJSONValue;

EJSON.fromJSONValue = item => {
  const top = fromJSONValueHelper(item);
  if (top !== item && !(item && isObject(item))) return top;

  if (!isObject(item)) return item;
  const copy = EJSON.clone(item);
  return adjustTypesFromJSONValue(copy);
};

// ------ Public API ------

EJSON.stringify = handleError((item, options) => {
  const json = EJSON.toJSONValue(item);
  if (options && (options.canonical || options.indent)) {
    // dynamic import is okay inside error-wrapper
    const canonical = require('./stringify').default;
    return canonical(json, options);
  }
  return JSON.stringify(json);
});

EJSON.parse = str => {
  if (typeof str !== 'string') {
    throw new Error('EJSON.parse argument should be a string');
  }
  return EJSON.fromJSONValue(JSON.parse(str));
};

EJSON.isBinary = obj =>
  !!(
    (typeof Uint8Array !== 'undefined' && obj instanceof Uint8Array) ||
    (obj && obj.$Uint8ArrayPolyfill)
  );

EJSON.equals = (a, b, options) => {
  const keyOrderSensitive = !!(options && options.keyOrderSensitive);
  if (a === b) return true;
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  if (!a || !b) return false;
  if (!(isObject(a) && isObject(b))) return false;

  // Date compare
  if (a instanceof Date && b instanceof Date) {
    return a.valueOf() === b.valueOf();
  }

  // Binary compare
  if (EJSON.isBinary(a) && EJSON.isBinary(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  // Custom equals
  if (isFunction(a.equals)) return a.equals(b, options);
  if (isFunction(b.equals)) return b.equals(a, options);

  // Array compare
  const aArr = arrayIsArray(a);
  const bArr = arrayIsArray(b);
  if (aArr || bArr) {
    if (aArr !== bArr || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!EJSON.equals(a[i], b[i], options)) return false;
    }
    return true;
  }

  // Fallback for custom types without equals()
  if (EJSON._isCustomType(a) || EJSON._isCustomType(b)) {
    if (EJSON._isCustomType(a) ^ EJSON._isCustomType(b)) return false;
    return EJSON.equals(
      EJSON.toJSONValue(a),
      EJSON.toJSONValue(b),
      options
    );
  }

  // Object structural compare
  const aKeys = objKeys(a);
  const bKeys = objKeys(b);
  if (keyOrderSensitive) {
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++) {
      if (
        aKeys[i] !== bKeys[i] ||
        !EJSON.equals(a[aKeys[i]], b[bKeys[i]], options)
      ) {
        return false;
      }
    }
    return true;
  } else {
    if (aKeys.length !== bKeys.length) return false;
    for (let i = 0; i < aKeys.length; i++) {
      const k = aKeys[i];
      if (!hasOwn(b, k) || !EJSON.equals(a[k], b[k], options)) {
        return false;
      }
    }
    return true;
  }
};

EJSON.clone = v => {
  if (!isObject(v) || v === null) return v;
  if (v instanceof Date) return new Date(v.getTime());
  if (v instanceof RegExp) return v;

  // Binary clone
  if (EJSON.isBinary(v)) {
    const bin = Base64NewBinary(v.length);
    for (let i = 0; i < v.length; i++) bin[i] = v[i];
    return bin;
  }

  // Array or arguments
  if (arrayIsArray(v)) {
    const a = new Array(v.length);
    for (let i = 0; i < v.length; i++) a[i] = EJSON.clone(v[i]);
    return a;
  }
  if (isArguments(v)) {
    const args = Array.from(v);
    return args.map(EJSON.clone);
  }

  // User‐defined clone()
  if (isFunction(v.clone)) return v.clone();

  // Custom type
  if (EJSON._isCustomType(v)) {
    const json = EJSON.toJSONValue(v);
    return EJSON.fromJSONValue(EJSON.clone(json));
  }

  // Plain object
  const out = Object.create(null);
  const k = objKeys(v);
  for (let i = 0; i < k.length; i++) {
    out[k[i]] = EJSON.clone(v[k[i]]);
  }
  return out;
};

// New binary allocator
EJSON.newBinary = Base64NewBinary;
