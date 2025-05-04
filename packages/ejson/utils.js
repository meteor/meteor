// Cache prototype reference
const { hasOwnProperty } = Object.prototype;
// Pre-compile the regex once
const maxStackRegex = /Maximum call stack size exceeded/;

export const isFunction = fn => typeof fn === 'function';

export const isObject = obj => obj !== null && typeof obj === 'object';

export const keysOf = obj => Object.keys(obj);

export const lengthOf = obj => {
  let count = 0;
  for (const key in obj) {
    if (hasOwnProperty.call(obj, key)) {
      count++;
    }
  }
  return count;
};

export const hasOwn = (obj, prop) => hasOwnProperty.call(obj, prop);

export const convertMapToObject = map => {
  // Create a clean object without prototype
  const result = Object.create(null);
  for (const [key, value] of map) {
    result[key] = value;
  }
  return result;
};

export const isArguments = obj => obj != null && hasOwn(obj, 'callee');

export const isInfOrNaN = obj =>
  Number.isNaN(obj) || obj === Infinity || obj === -Infinity;

export const checkError = {
  maxStack: msg => maxStackRegex.test(msg),
};

export const handleError = fn => {
  const wrapped = function(...args) {
    try {
      return fn.apply(this, args);
    } catch (error) {
      if (checkError.maxStack(error.message)) {
        // normalize circular-structure error
        throw new Error('Converting circular structure to JSON');
      }
      throw error;
    }
  };
  // Preserve the original function name (optional)
  Object.defineProperty(wrapped, 'name', {
    value: fn.name,
    configurable: true,
  });
  return wrapped;
};