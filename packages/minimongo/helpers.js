// Like _.isArray, but doesn't regard polyfilled Uint8Arrays on old browsers as
// arrays.
// XXX maybe this should be EJSON.isArray
isArray = function (x) {
  return _.isArray(x) && !EJSON.isBinary(x);
};

// XXX maybe this should be EJSON.isObject, though EJSON doesn't know about
// RegExp
// XXX note that _type(undefined) === 3!!!!
isPlainObject = function (x) {
  return x && LocalCollection._f._type(x) === 3;
};

isIndexable = function (x) {
  return isArray(x) || isPlainObject(x);
};

isOperatorObject = function (valueSelector) {
  if (!isPlainObject(valueSelector))
    return false;

  var theseAreOperators = undefined;
  _.each(valueSelector, function (value, selKey) {
    var thisIsOperator = selKey.substr(0, 1) === '$';
    if (theseAreOperators === undefined) {
      theseAreOperators = thisIsOperator;
    } else if (theseAreOperators !== thisIsOperator) {
      throw new Error("Inconsistent operator: " + valueSelector);
    }
  });
  return !!theseAreOperators;  // {} has no operators
};


// string can be converted to integer
isNumericKey = function (s) {
  return /^[0-9]+$/.test(s);
};
