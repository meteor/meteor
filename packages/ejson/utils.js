export const isFunction = (fn) => typeof fn === 'function';

export const isObject = (fn) => typeof fn === 'object';

export const keysOf = (obj) => Object.keys(obj);

export const lengthOf = (obj) => Object.keys(obj).length;

export const hasOwn = (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop);

export const convertMapToObject = (map) => Array.from(map).reduce((acc, [key, value]) => {
  // reassign to not create new object
  acc[key] = value;
  return acc;
}, {});

export const isArguments = obj => obj != null && hasOwn(obj, 'callee');

export const isInfOrNaN =
  obj => Number.isNaN(obj) || obj === Infinity || obj === -Infinity;

export const checkError = {
  maxStack: (msgError) => new RegExp('Maximum call stack size exceeded', 'g').test(msgError),
};

export const handleError = (fn) => function() {
  try {
    return fn.apply(this, arguments);
  } catch (error) {
    const isMaxStack = checkError.maxStack(error.message);
    if (isMaxStack) {
      throw new Error('Converting circular structure to JSON')
    }
    throw error;
  }
};
