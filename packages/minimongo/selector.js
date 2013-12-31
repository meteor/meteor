// Like _.isArray, but doesn't regard polyfilled Uint8Arrays on old browsers as
// arrays.
// XXX maybe this should be EJSON.isArray
isArray = function (x) {
  return _.isArray(x) && !EJSON.isBinary(x);
};

// XXX maybe this should be EJSON.isObject, though EJSON doesn't know about
// RegExp
// XXX note that _type(undefined) === 3!!!!
var isPlainObject = function (x) {
  return x && LocalCollection._f._type(x) === 3;
};

var isIndexable = function (x) {
  return isArray(x) || isPlainObject(x);
};

var isOperatorObject = function (valueSelector) {
  if (!isPlainObject(valueSelector))
    return false;

  var theseAreOperators = undefined;
  _.each(valueSelector, function (value, selKey) {
    var thisIsOperator = selKey.substr(0, 1) === '$';
    if (theseAreOperators === undefined) {
      theseAreOperators = thisIsOperator;
    } else if (theseAreOperators !== thisIsOperator) {
      throw new Error("Inconsistent selector: " + valueSelector);
    }
  });
  return !!theseAreOperators;  // {} has no operators
};


var compileValueSelector = function (valueSelector, selectorObjIfRoot) {
  if (valueSelector instanceof RegExp)
    return convertElementSelectorToBranchedSelector(
      regexpElementSelector(valueSelector));
  else if (isOperatorObject(valueSelector))
    return operatorValueSelector(valueSelector, selectorObjIfRoot);
  else {
    return convertElementSelectorToBranchedSelector(
      equalityElementSelector(valueSelector));
  }
};

var regexpElementSelector = function (regexp) {
  return function (value) {
    if (value instanceof RegExp) {
      // Comparing two regexps means seeing if the regexps are identical
      // (really!). Underscore knows how.
      return _.isEqual(value, regexp);
    }
    // Regexps only work against strings.
    if (typeof value !== 'string')
      return false;
    return regexp.test(value);
  };
};


var convertElementSelectorToBranchedSelector = function (
    elementSelector, options) {
  options = options || {};
  return function (branches) {
    var expanded = branches;
    if (!options.dontExpandLeafArrays) {
      expanded = expandArraysInBranches(
        branches, options.dontIncludeLeafArrays);
    }
    var result = _.any(expanded, function (element) {
      // XXX arrayIndex!  need to save the winner here
      return elementSelector(element.value);
    });
    return {result: result};
  };
};

var equalityElementSelector = function (elementSelector) {
  if (isOperatorObject(elementSelector))
    throw Error("Can't create equalityValueSelector for operator object");

  // Special-case: null and undefined are equal (if you got undefined in there
  // somewhere, or if you got it due to some branch being non-existent in the
  // weird special case), even though they aren't with EJSON.equals.
  if (elementSelector == null) {  // undefined or null
    return function (value) {
      return value == null;  // undefined or null
    };
  }

  return function (value) {
    return LocalCollection._f._equal(elementSelector, value);
  };
};

var operatorValueSelector = function (valueSelector, selectorObjIfRoot) {
  // Each valueSelector works separately on the various branches.  So one
  // operator can match one branch and another can match another branch.  This
  // is OK.

  var operatorFunctions = [];
  _.each(valueSelector, function (operand, operator) {
    if (_.has(VALUE_OPERATORS, operator)) {
      operatorFunctions.push(
        VALUE_OPERATORS[operator](operand, valueSelector, selectorObjIfRoot));
    } else if (_.has(ELEMENT_OPERATORS, operator)) {
      // XXX justify three arguments
      var options = ELEMENT_OPERATORS[operator];
      if (typeof options === 'function')
        options = {elementSelector: options};
      operatorFunctions.push(
        convertElementSelectorToBranchedSelector(
          options.elementSelector(operand, valueSelector),
          options));
    } else {
      throw new Error("Unrecognized operator: " + operator);
    }
  });

  return andBranchedSelectors(operatorFunctions);
};

var compileArrayOfDocumentSelectors = function (selectors) {
  if (!isArray(selectors) || _.isEmpty(selectors))
    throw Error("$and/$or/$nor must be nonempty array");
  return _.map(selectors, function (subSelector) {
    if (!isPlainObject(subSelector))
      throw Error("$or/$and/$nor entries need to be full objects");
    return compileDocumentSelector(subSelector);
  });
};


// XXX can factor out common logic below
var LOGICAL_OPERATORS = {
  $and: function (subSelector) {
    var selectors = compileArrayOfDocumentSelectors(subSelector);
    return andCompiledDocumentSelectors(selectors);
  },

  $or: function (subSelector) {
    var selectors = compileArrayOfDocumentSelectors(subSelector);
    return function (doc) {
      var result = _.any(selectors, function (f) {
        return f(doc).result;
      });
      // XXX arrayIndex!
      return {result: result};
    };
  },

  $nor: function (subSelector) {
    var selectors = compileArrayOfDocumentSelectors(subSelector);
    return function (doc) {
      var result = _.all(selectors, function (f) {
        return !f(doc).result;
      });
      // Never set arrayIndex, because we only match if nothing in particular
      // "matched".
      return {result: result};
    };
  },

  $where: function (selectorValue) {
    if (!(selectorValue instanceof Function)) {
      // XXX MongoDB seems to have more complex logic to decide where or or not
      // to add "return"; not sure exactly what it is.
      selectorValue = Function("obj", "return " + selectorValue);
    }
    return function (doc) {
      // We make the document available as both `this` and `obj`.
      // XXX not sure what we should do if this throws
      return {result: selectorValue.call(doc, doc)};
    };
  },

  // This is just used as a comment in the query (in MongoDB, it also ends up in
  // query logs); it has no effect on the actual selection.
  $comment: function () {
    return function () {
      return {result: true};
    };
  }
};

var invertBranchedSelector = function (branchedSelector) {
  // Note that this implicitly "deMorganizes" the wrapped function.  ie, it
  // means that ALL branch values need to fail to match innerBranchedSelector.
  return function (branchValues) {
    var invertMe = branchedSelector(branchValues);
    // We explicitly choose to strip arrayIndex here: it doesn't make sense to
    // say "update the array element that does not match something", at least
    // in mongo-land.
    return {result: !invertMe.result};
  };
};

// XXX doc
var VALUE_OPERATORS = {
  $not: function (operand, operator) {
    return invertBranchedSelector(compileValueSelector(operand));
  },
  $ne: function (operand) {
    return invertBranchedSelector(convertElementSelectorToBranchedSelector(
      equalityElementSelector(operand)));
  },
  $nin: function (operand) {
    return invertBranchedSelector(convertElementSelectorToBranchedSelector(
      ELEMENT_OPERATORS.$in(operand)));
  },
  $exists: function (operand) {
    var exists = convertElementSelectorToBranchedSelector(function (value) {
      return value !== undefined;
    });
    return operand ? exists : invertBranchedSelector(exists);
  },
  // $options just provides options for $regex; its logic is inside $regex
  $options: function (operand, valueSelector) {
    if (!valueSelector.$regex)
      throw Error("$options needs a $regex");
    return matchesEverythingSelector;
  },
  // $maxDistance is basically an argument to $near
  $maxDistance: function (operand, valueSelector) {
    if (!valueSelector.$near)
      throw Error("$maxDistance needs a $near");
    return matchesEverythingSelector;
  },
  $all: function (operand) {
    if (!isArray(operand))
      throw Error("$all requires array");
    // Not sure why, but this seems to be what MongoDB does.
    if (_.isEmpty(operand))
      return matchesNothingSelector;

    var branchedSelectors = [];
    _.each(operand, function (criterion) {
      // XXX handle $all/$elemMatch combination
      if (isOperatorObject(criterion))
        throw Error("no $ expressions in $all");
      // This is always a regexp or equality selector.
      branchedSelectors.push(compileValueSelector(criterion));
    });
    // andBranchedSelectors does NOT require all selectors to return true on the
    // SAME branch.
    return andBranchedSelectors(branchedSelectors);
  },

  $near: function (operand, valueSelector, selectorObjIfRoot) {
    if (!selectorObjIfRoot)
      throw Error("$near can't be inside another $ operator");
    selectorObjIfRoot._isGeoQuery = true;

    // There are two kinds of geodata in MongoDB: coordinate pairs and
    // GeoJSON. They use different distance metrics, too. GeoJSON queries are
    // marked with a $geometry property.

    var maxDistance, point, distance;
    if (isPlainObject(operand) && _.has(operand, '$geometry')) {
      // GeoJSON "2dsphere" mode.
      maxDistance = operand.$maxDistance;
      point = operand.$geometry;
      distance = function (value) {
        // XXX: for now, we don't calculate the actual distance between, say,
        // polygon and circle. If people care about this use-case it will get
        // a priority.
        if (!value || !value.type)
          return null;
        if (value.type === "Point") {
          return GeoJSON.pointDistance(point, value);
        } else {
          return GeoJSON.geometryWithinRadius(value, point, maxDistance)
            ? 0 : maxDistance + 1;
        }
      };
    } else {
      maxDistance = valueSelector.$maxDistance;
      if (!isArray(operand) && !isPlainObject(operand))
        throw Error("$near argument must be coordinate pair or GeoJSON");
      point = pointToArray(operand);
      distance = function (value) {
        if (!isArray(value) && !isPlainObject(value))
          return null;
        return distanceCoordinatePairs(point, value);
      };
    }

    return function (branchedValues) {
      // There might be multiple points in the document that match the given
      // field. Only one of them needs to be within $maxDistance, but we need to
      // evaluate all of them and use the nearest one for the implicit sort
      // specifier. (That's why we can't just use ELEMENT_OPERATORS here.)
      //
      // Note: This differs from MongoDB's implementation, where a document will
      // actually show up *multiple times* in the result set, with one entry for
      // each within-$maxDistance branching point.
      branchedValues = expandArraysInBranches(branchedValues);
      var minDistance = null;
      _.each(branchedValues, function (branch) {
        var curDistance = distance(branch.value);
        // Skip branches that aren't real points or are too far away.
        if (curDistance === null || curDistance > maxDistance)
          return;
        // Skip anything that's a tie.
        if (minDistance !== null && minDistance <= curDistance)
          return;
        minDistance = curDistance;
      });
      if (minDistance !== null) {
        // XXX arrayIndex!
        return {result: true, distance: minDistance};
      }
      return {result: false};
    };
  }
};

var distanceCoordinatePairs = function (a, b) {
  a = pointToArray(a);
  b = pointToArray(b);
  var x = a[0] - b[0];
  var y = a[1] - b[1];
  if (_.isNaN(x) || _.isNaN(y))
    return null;
  return Math.sqrt(x * x + y * y);
};
// Makes sure we get 2 elements array and assume the first one to be x and
// the second one to y no matter what user passes.
// In case user passes { lon: x, lat: y } returns [x, y]
var pointToArray = function (point) {
  return _.map(point, _.identity);
};

var makeInequality = function (cmpValueComparator) {
  return function (operand) {
    // Arrays never compare false with non-arrays for any inequality.
    if (isArray(operand)) {
      return function () {
        return false;
      };
    }

    // Special case: consider undefined and null the same (so true with
    // $gte/$lte).
    if (operand === undefined)
      operand = null;

    var operandType = LocalCollection._f._type(operand);

    return function (value) {
      if (value === undefined)
        value = null;
      // Comparisons are never true among things of different type (except null
      // vs undefined).
      if (LocalCollection._f._type(value) !== operandType)
        return false;
      return cmpValueComparator(LocalCollection._f._cmp(value, operand));
    };
  };
};

// XXX redoc
// Each value operator is a function with args:
//  - operand - Anything
//  - operators - Object - operators on the same level (neighbours)
// returns a function with args:
//  - value - a value the operator is tested against
var ELEMENT_OPERATORS = {
  $lt: makeInequality(function (cmpValue) {
    return cmpValue < 0;
  }),
  $gt: makeInequality(function (cmpValue) {
    return cmpValue > 0;
  }),
  $lte: makeInequality(function (cmpValue) {
    return cmpValue <= 0;
  }),
  $gte: makeInequality(function (cmpValue) {
    return cmpValue >= 0;
  }),
  $mod: function (operand) {
    if (!(isArray(operand) && operand.length === 2
          && typeof(operand[0]) === 'number'
          && typeof(operand[1]) === 'number')) {
      throw Error("argument to $mod must be an array of two numbers");
    }
    // XXX could require to be ints or round or something
    var divisor = operand[0];
    var remainder = operand[1];
    return function (value) {
      return typeof value === 'number' && value % divisor === remainder;
    };
  },
  $in: function (operand) {
    if (!isArray(operand))
      throw Error("$in needs an array");

    var elementSelectors = [];
    _.each(operand, function (option) {
      if (option instanceof RegExp)
        elementSelectors.push(regexpElementSelector(option));
      else if (isOperatorObject(option))
        throw Error("cannot nest $ under $in");
      else
        elementSelectors.push(equalityElementSelector(option));
    });

    return function (value) {
      // Allow {a: {$in: [null]}} to match when 'a' does not exist.
      if (value === undefined)
        value = null;
      return _.any(elementSelectors, function (e) {
        return e(value);
      });
    };
  },
  $size: {
    // {a: [[5, 5]]} must match {a: {$size: 1}} but not {a: {$size: 2}}, so we
    // don't want to consider the element [5,5] in the leaf array [[5,5]] as a
    // possible value.
    dontExpandLeafArrays: true,
    elementSelector: function (operand) {
      if (typeof operand === 'string') {
        // Don't ask me why, but by experimentation, this seems to be what Mongo
        // does.
        operand = 0;
      } else if (typeof operand !== 'number') {
        throw Error("$size needs a number");
      }
      return function (value) {
        return isArray(value) && value.length === operand;
      };
    }
  },
  $type: {
    // {a: [5]} must not match {a: {$type: 4}} (4 means array), but it should
    // match {a: {$type: 1}} (1 means number), and {a: [[5]]} must match {$a:
    // {$type: 4}}. Thus, when we see a leaf array, we *should* expand it but
    // should *not* include it itself.
    dontIncludeLeafArrays: true,
    elementSelector: function (operand) {
      if (typeof operand !== 'number')
        throw Error("$type needs a number");
      return function (value) {
        return value !== undefined
          && LocalCollection._f._type(value) === operand;
      };
    }
  },
  $regex: function (operand, valueSelector) {
    if (!(typeof operand === 'string' || operand instanceof RegExp))
      throw Error("$regex has to be a string or RegExp");

    var regexp;
    if (valueSelector.$options !== undefined) {
      // Options passed in $options (even the empty string) always overrides
      // options in the RegExp object itself. (See also
      // Meteor.Collection._rewriteSelector.)

      // Be clear that we only support the JS-supported options, not extended
      // ones (eg, Mongo supports x and s). Ideally we would implement x and s
      // by transforming the regexp, but not today...
      if (/[^gim]/.test(valueSelector.$options))
        throw new Error("Only the i, m, and g regexp options are supported");

      var regexSource = operand instanceof RegExp ? operand.source : operand;
      regexp = new RegExp(regexSource, valueSelector.$options);
    } else if (operand instanceof RegExp) {
      regexp = operand;
    } else {
      regexp = new RegExp(operand);
    }
    return regexpElementSelector(regexp);
  },
  $elemMatch: {
    dontExpandLeafArrays: true,
    elementSelector: function (operand, valueSelector) {
      if (!isPlainObject(operand))
        throw Error("$elemMatch need an object");

      var matcher, isDocMatcher;
      if (isOperatorObject(operand)) {
        matcher = compileValueSelector(operand);
        isDocMatcher = false;
      } else {
        // This is NOT the same as compileValueSelector(operand), and not just
        // because of the slightly different calling convention.
        // {$elemMatch: {x: 3}} means "an element has a field x:3", not
        // "consists only of a field x:3". Also, regexps and sub-$ are allowed.
        matcher = compileDocumentSelector(operand);
        isDocMatcher = true;
      }

      return function (value) {
        if (!isArray(value))
          return false;
        return _.any(value, function (arrayElement) {
          // XXX arrayIndex!
          // XXX nesting geo stuff in here!
          var arg;
          if (isDocMatcher) {
            // We can only match {$elemMatch: {b: 3}} against objects.
            // (We can also match against arrays, if there's numeric indices,
            // eg {$elemMatch: {'0.b': 3}} or {$elemMatch: {0: 3}}.)
            if (!isPlainObject(arrayElement) && !isArray(arrayElement))
              return false;
            arg = arrayElement;
          } else {
            // dontIterate ensures that {a: {$elemMatch: {$gt: 5}}} matches
            // {a: [8]} but not {a: [[8]]}
            arg = [{value: arrayElement, dontIterate: true}];
          }
          return matcher(arg).result;
        });
      };
    }
  }
};

// helpers used by compiled selector code
LocalCollection._f = {
  // XXX for _all and _in, consider building 'inquery' at compile time..

  _type: function (v) {
    if (typeof v === "number")
      return 1;
    if (typeof v === "string")
      return 2;
    if (typeof v === "boolean")
      return 8;
    if (isArray(v))
      return 4;
    if (v === null)
      return 10;
    if (v instanceof RegExp)
      // note that typeof(/x/) === "object"
      return 11;
    if (typeof v === "function")
      return 13;
    if (v instanceof Date)
      return 9;
    if (EJSON.isBinary(v))
      return 5;
    if (v instanceof LocalCollection._ObjectID)
      return 7;
    return 3; // object

    // XXX support some/all of these:
    // 14, symbol
    // 15, javascript code with scope
    // 16, 18: 32-bit/64-bit integer
    // 17, timestamp
    // 255, minkey
    // 127, maxkey
  },

  // deep equality test: use for literal document and array matches
  _equal: function (a, b) {
    return EJSON.equals(a, b, {keyOrderSensitive: true});
  },

  // maps a type code to a value that can be used to sort values of
  // different types
  _typeorder: function (t) {
    // http://www.mongodb.org/display/DOCS/What+is+the+Compare+Order+for+BSON+Types
    // XXX what is the correct sort position for Javascript code?
    // ('100' in the matrix below)
    // XXX minkey/maxkey
    return [-1,  // (not a type)
            1,   // number
            2,   // string
            3,   // object
            4,   // array
            5,   // binary
            -1,  // deprecated
            6,   // ObjectID
            7,   // bool
            8,   // Date
            0,   // null
            9,   // RegExp
            -1,  // deprecated
            100, // JS code
            2,   // deprecated (symbol)
            100, // JS code
            1,   // 32-bit int
            8,   // Mongo timestamp
            1    // 64-bit int
           ][t];
  },

  // compare two values of unknown type according to BSON ordering
  // semantics. (as an extension, consider 'undefined' to be less than
  // any other value.) return negative if a is less, positive if b is
  // less, or 0 if equal
  _cmp: function (a, b) {
    if (a === undefined)
      return b === undefined ? 0 : -1;
    if (b === undefined)
      return 1;
    var ta = LocalCollection._f._type(a);
    var tb = LocalCollection._f._type(b);
    var oa = LocalCollection._f._typeorder(ta);
    var ob = LocalCollection._f._typeorder(tb);
    if (oa !== ob)
      return oa < ob ? -1 : 1;
    if (ta !== tb)
      // XXX need to implement this if we implement Symbol or integers, or
      // Timestamp
      throw Error("Missing type coercion logic in _cmp");
    if (ta === 7) { // ObjectID
      // Convert to string.
      ta = tb = 2;
      a = a.toHexString();
      b = b.toHexString();
    }
    if (ta === 9) { // Date
      // Convert to millis.
      ta = tb = 1;
      a = a.getTime();
      b = b.getTime();
    }

    if (ta === 1) // double
      return a - b;
    if (tb === 2) // string
      return a < b ? -1 : (a === b ? 0 : 1);
    if (ta === 3) { // Object
      // this could be much more efficient in the expected case ...
      var to_array = function (obj) {
        var ret = [];
        for (var key in obj) {
          ret.push(key);
          ret.push(obj[key]);
        }
        return ret;
      };
      return LocalCollection._f._cmp(to_array(a), to_array(b));
    }
    if (ta === 4) { // Array
      for (var i = 0; ; i++) {
        if (i === a.length)
          return (i === b.length) ? 0 : -1;
        if (i === b.length)
          return 1;
        var s = LocalCollection._f._cmp(a[i], b[i]);
        if (s !== 0)
          return s;
      }
    }
    if (ta === 5) { // binary
      // Surprisingly, a small binary blob is always less than a large one in
      // Mongo.
      if (a.length !== b.length)
        return a.length - b.length;
      for (i = 0; i < a.length; i++) {
        if (a[i] < b[i])
          return -1;
        if (a[i] > b[i])
          return 1;
      }
      return 0;
    }
    if (ta === 8) { // boolean
      if (a) return b ? 0 : 1;
      return b ? -1 : 0;
    }
    if (ta === 10) // null
      return 0;
    if (ta === 11) // regexp
      throw Error("Sorting not supported on regular expression"); // XXX
    // 13: javascript code
    // 14: symbol
    // 15: javascript code with scope
    // 16: 32-bit integer
    // 17: timestamp
    // 18: 64-bit integer
    // 255: minkey
    // 127: maxkey
    if (ta === 13) // javascript code
      throw Error("Sorting not supported on Javascript code"); // XXX
    throw Error("Unknown type to sort");
  }
};

// For unit tests. True if the given document matches the given
// selector.
MinimongoTest.matches = function (selector, doc) {
  return new Minimongo.Selector(selector).documentMatches(doc).result;
};


// string can be converted to integer
numericKey = function (s) {
  return /^[0-9]+$/.test(s);
};

// XXX redoc
// XXX be aware that Sorter currently assumes that lookup functions
//     return non-empty arrays but that is no longer the case
// _makeLookupFunction(key) returns a lookup function.
//
// A lookup function takes in a document and returns an array of matching
// values.  If no arrays are found while looking up the key, this array will
// have exactly one value (possibly 'undefined', if some segment of the key was
// not found).
//
// If arrays are found in the middle, this can have more than one element, since
// we "branch". When we "branch", if there are more key segments to look up,
// then we only pursue branches that are plain objects (not arrays or scalars).
// This means we can actually end up with no entries!
//
// At the top level, you may only pass in a plain object.
//
// _makeLookupFunction('a.x')({a: {x: 1}}) returns [1]
// _makeLookupFunction('a.x')({a: {x: [1]}}) returns [[1]]
// _makeLookupFunction('a.x')({a: 5})  returns [undefined]
// _makeLookupFunction('a.x')({a: [5]})  returns []
// _makeLookupFunction('a.x')({a: [{x: 1},
//                                 [],
//                                 4,
//                                 {x: [2]},
//                                 {y: 3}]})
//   returns [1, [2], undefined]
LocalCollection._makeLookupFunction2 = function (key) {
  var parts = key.split('.');
  var firstPart = parts.length ? parts[0] : '';
  var firstPartIsNumeric = numericKey(firstPart);
  var lookupRest;
  if (parts.length > 1) {
    lookupRest = LocalCollection._makeLookupFunction2(parts.slice(1).join('.'));
  }

  // Doc will always be a plain object or an array.
  // apply an explicit numeric index, an array.
  return function (doc, firstArrayIndex) {
    if (isArray(doc)) {
      // If we're being asked to do an invalid lookup into an array (non-integer
      // or out-of-bounds), return no results (which is different from returning
      // a single undefined result, in that `null` equality checks won't match).
      if (!(firstPartIsNumeric && firstPart < doc.length))
        return [];

      // If this is the first array index we've seen, remember the index.
      // (Mongo doesn't support multiple uses of '$', at least not in 2.5.
      if (firstArrayIndex === undefined)
        firstArrayIndex = +firstPart;
    }

    // Do our first lookup.
    var firstLevel = doc[firstPart];

    // If there is no deeper to dig, return what we found.
    //
    // If what we found is an array, most value selectors will choose to treat
    // the elements of the array as matchable values in their own right, but
    // that's done outside of the lookup function. (Exceptions to this are $size
    // and stuff relating to $elemMatch.  eg, {a: {$size: 2}} does not match {a:
    // [[1, 2]]}.)
    //
    // That said, if we just did an *explicit* array lookup (on doc) to find
    // firstLevel, and firstLevel is an array too, we do NOT want value
    // selectors to iterate over it.  eg, {'a.0': 5} does not match {a: [[5]]}.
    // So in that case, we mark the return value as "don't iterate".
    if (!lookupRest) {
      return [{value: firstLevel,
               dontIterate: isArray(doc) && isArray(firstLevel),
               arrayIndex: firstArrayIndex}];
    }

    // We need to dig deeper.  But if we can't, because what we've found is not
    // an array or plain object, we're done. If we just did a numeric index into
    // an array, we return nothing here (this is a change in Mongo 2.5 from
    // Mongo 2.4, where {'a.0.b': null} stopped matching {a: [5]}). Otherwise,
    // return a single `undefined` (which can, for example, match via equality
    // with `null`).
    if (!isIndexable(firstLevel)) {
      return isArray(doc) ? [] : [{value: undefined,
                                   arrayIndex: firstArrayIndex}];
    }

    var result = [];
    var appendToResult = function (more) {
      Array.prototype.push.apply(result, more);
    };

    // Dig deeper: look up the rest of the parts on whatever we've found.
    // (lookupRest is smart enough to not try to do invalid lookups into
    // firstLevel if it's an array.)
    appendToResult(lookupRest(firstLevel, firstArrayIndex));

    // If we found an array, then in *addition* to potentially treating the next
    // part as a literal integer lookup, we should also "branch": try to do look
    // up the rest of the parts on each array element in parallel.
    //
    // In this case, we *only* dig deeper into array elements that are plain
    // objects. (Recall that we only got this far if we have further to dig.)
    // This makes sense: we certainly don't dig deeper into non-indexable
    // objects. And it would be weird to dig into an array: it's simpler to have
    // a rule that explicit integer indexes only apply to an outer array, not to
    // an array you find after a branching search.
    if (isArray(firstLevel)) {
      _.each(firstLevel, function (branch, arrayIndex) {
        if (isPlainObject(branch)) {
          appendToResult(lookupRest(
            branch,
            firstArrayIndex === undefined ? arrayIndex : firstArrayIndex));
        }
      });
    }

    return result;
  };
};

LocalCollection._makeLookupFunction = function (key) {
  var real = LocalCollection._makeLookupFunction2(key);
  return function (doc) {
    return _.pluck(real(doc), 'value');
  };
};

var expandArraysInBranches = function (branches, skipTheArrays) {
  var branchesOut = [];
  _.each(branches, function (branch) {
    var thisIsArray = isArray(branch.value);
    if (!skipTheArrays || !thisIsArray) {
      branchesOut.push({
        value: branch.value,
        arrayIndex: branch.arrayIndex
      });
    }
    if (thisIsArray && !branch.dontIterate) {
      _.each(branch.value, function (leaf, i) {
        branchesOut.push({
          value: leaf,
          arrayIndex: branch.arrayIndex === undefined ? i : branch.arrayIndex
        });
      });
    }
  });
  return branchesOut;
};

// The main compilation function for a given selector.
var compileDocumentSelector = function (docSelector, selectorObjIfRoot) {
  var perKeySelectors = [];
  _.each(docSelector, function (subSelector, key) {
    if (key.substr(0, 1) === '$') {
      // Outer operators are either logical operators (they recurse back into
      // this function), or $where.
      if (!_.has(LOGICAL_OPERATORS, key))
        throw new Error("Unrecognized logical operator: " + key);
      // XXX rename perKeySelectors
      perKeySelectors.push(LOGICAL_OPERATORS[key](subSelector));
    } else {
      var lookUpByIndex = LocalCollection._makeLookupFunction2(key);
      var valueSelectorFunc =
        compileValueSelector(subSelector, selectorObjIfRoot);
      perKeySelectors.push(function (doc) {
        var branchValues = lookUpByIndex(doc);
        return valueSelectorFunc(branchValues);
      });
    }
  });

  return andCompiledDocumentSelectors(perKeySelectors);
};

// XXX doc and move around
Minimongo.Selector = function (selector) {
  var self = this;
  self._isGeoQuery = false;  // can get overwritten by compilation
  self._docSelector = compileSelector(selector, self);
};

_.extend(Minimongo.Selector.prototype, {
  documentMatches: function (doc) {
    return this._docSelector(doc);
  },
  isGeoQuery: function () {
    return this._isGeoQuery;
  }
});

// Given a selector, return a function that takes one argument, a
// document. It returns an object with fields
//    - result: bool, true if the document matches the selector
// XXX add "arrayIndex" for use by update with '$'
var compileSelector = function (selector, selectorObject) {
  // you can pass a literal function instead of a selector
  if (selector instanceof Function)
    return function (doc) {
      return {result: !!selector.call(doc)};
    };

  // shorthand -- scalars match _id
  if (LocalCollection._selectorIsId(selector)) {
    return function (doc) {
      return {result: EJSON.equals(doc._id, selector)};
    };
  }

  // protect against dangerous selectors.  falsey and {_id: falsey} are both
  // likely programmer error, and not what you want, particularly for
  // destructive operations.
  if (!selector || (('_id' in selector) && !selector._id))
    return matchesNothingSelector;

  // Top level can't be an array or true or binary.
  if (typeof(selector) === 'boolean' || isArray(selector) ||
      EJSON.isBinary(selector))
    throw new Error("Invalid selector: " + selector);

  return compileDocumentSelector(selector, selectorObject);
};

var matchesNothingSelector = function (docOrBranchedValues) {
  return {result: false};
};

var matchesEverythingSelector = function (docOrBranchedValues) {
  return {result: true};
};


// NB: We are cheating and using this function to implement "AND" for both
// "document selectors" and "branched selectors". They have the same return type
// but the argument is different: for the former it's a whole doc, whereas for
// the latter it's an array of "branches" that match a given key path.
var andSomeSelectors = function (branchedSelectors) {
  return function (branches, doc) {
    // XXX arrayIndex!
    var ret = {};
    var distance;
    ret.result = _.all(branchedSelectors, function (f) {
      var subResult = f(branches, doc);
      // Copy a 'distance' number out of the first sub-selector that has
      // one. Yes, this means that if there are multiple $near fields in a
      // query, something arbitrary happens; this appears to be consistent with
      // Mongo.
      if (subResult.result && subResult.distance !== undefined
          && distance === undefined) {
        distance = subResult.distance;
      }
      return subResult.result;
    });
    if (ret.result && distance !== undefined)
      ret.distance = distance;
    return ret;
  };
};

var andCompiledDocumentSelectors = andSomeSelectors;
var andBranchedSelectors = andSomeSelectors;
