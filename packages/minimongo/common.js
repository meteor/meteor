import {LocalCollection} from './local_collection.js';

export function isIndexable (obj) {
  return Array.isArray(obj) || LocalCollection._isPlainObject(obj);
}

export function isNumericKey (s) {
  return /^[0-9]+$/.test(s);
}

// Returns true if this is an object with at least one key and all keys begin
// with $.  Unless inconsistentOK is set, throws if some keys begin with $ and
// others don't.
export function isOperatorObject (valueSelector, inconsistentOK) {
  if (!LocalCollection._isPlainObject(valueSelector))
    return false;

  var theseAreOperators = undefined;
  Object.keys(valueSelector).forEach(function (selKey) {
    var thisIsOperator = selKey.substr(0, 1) === '$';
    if (theseAreOperators === undefined) {
      theseAreOperators = thisIsOperator;
    } else if (theseAreOperators !== thisIsOperator) {
      if (!inconsistentOK)
        throw new Error(`Inconsistent operator: ${JSON.stringify(valueSelector)}`);
      theseAreOperators = false;
    }
  });
  return !!theseAreOperators;  // {} has no operators
}
