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

// If x is an array, true if f(e) is true for some e in x
//    (but never try f(x) directly)
// Otherwise, true if f(x) is true.
//
// Use this in cases where f(Array) should never be true...
// for example, equality comparisons to non-arrays,
// ordering comparisons (which should always be false if either side
// is an array), regexps (need string), mod (needs number)...
// XXX ensure comparisons are always false if LHS is an array
// XXX ensure comparisons among different types are false
var _anyIfArray = function (x, f) {
  if (isArray(x))
    return _.any(x, f);
  return f(x);
};

// True if f(x) is true, or x is an array and f(e) is true for some e in x.
//
// Use this for most operators where an array could satisfy the predicate.
var _anyIfArrayPlus = function (x, f) {
  if (f(x))
    return true;
  return isArray(x) && _.any(x, f);
};

var hasOperators = function(valueSelector) {
  var theseAreOperators = undefined;
  for (var selKey in valueSelector) {
    var thisIsOperator = selKey.substr(0, 1) === '$';
    if (theseAreOperators === undefined) {
      theseAreOperators = thisIsOperator;
    } else if (theseAreOperators !== thisIsOperator) {
      throw new Error("Inconsistent selector: " + valueSelector);
    }
  }
  return !!theseAreOperators;  // {} has no operators
};

var compileValueSelector = function (valueSelector, selector, cursor) {
  if (valueSelector == null) {  // undefined or null
    return function (value) {
      return _anyIfArray(value, function (x) {
        return x == null;  // undefined or null
      });
    };
  }

  // Selector is a non-null primitive (and not an array or RegExp either).
  if (!_.isObject(valueSelector)) {
    return function (value) {
      return _anyIfArray(value, function (x) {
        return x === valueSelector;
      });
    };
  }

  if (valueSelector instanceof RegExp) {
    return function (value) {
      if (value === undefined)
        return false;
      return _anyIfArray(value, function (x) {
        return valueSelector.test(x);
      });
    };
  }

  // Arrays match either identical arrays or arrays that contain it as a value.
  if (isArray(valueSelector)) {
    return function (value) {
      if (!isArray(value))
        return false;
      return _anyIfArrayPlus(value, function (x) {
        return LocalCollection._f._equal(valueSelector, x);
      });
    };
  }

  // It's an object, but not an array or regexp.
  if (hasOperators(valueSelector)) {
    var operatorFunctions = [];
    _.each(valueSelector, function (operand, operator) {
      if (!_.has(VALUE_OPERATORS, operator))
        throw new Error("Unrecognized operator: " + operator);
      // Special case for location operators
      operatorFunctions.push(VALUE_OPERATORS[operator](
        operand, valueSelector, cursor));
    });
    return function (value, doc) {
      return _.all(operatorFunctions, function (f) {
        return f(value, doc);
      });
    };
  }

  // It's a literal; compare value (or element of value array) directly to the
  // selector.
  return function (value) {
    return _anyIfArray(value, function (x) {
      return LocalCollection._f._equal(valueSelector, x);
    });
  };
};

// XXX can factor out common logic below
var LOGICAL_OPERATORS = {
  "$and": function(subSelector, operators, cursor) {
    if (!isArray(subSelector) || _.isEmpty(subSelector))
      throw Error("$and/$or/$nor must be nonempty array");
    var subSelectorFunctions = _.map(subSelector, function (selector) {
      return compileDocumentSelector(selector, cursor);
    });
    return function (doc, wholeDoc) {
      return _.all(subSelectorFunctions, function (f) {
        return f(doc, wholeDoc).result;
      });
    };
  },

  "$or": function(subSelector, operators, cursor) {
    if (!isArray(subSelector) || _.isEmpty(subSelector))
      throw Error("$and/$or/$nor must be nonempty array");
    var subSelectorFunctions = _.map(subSelector, function (selector) {
      return compileDocumentSelector(selector, cursor);
    });
    return function (doc, wholeDoc) {
      return _.any(subSelectorFunctions, function (f) {
        return f(doc, wholeDoc).result;
      });
    };
  },

  "$nor": function(subSelector, operators, cursor) {
    if (!isArray(subSelector) || _.isEmpty(subSelector))
      throw Error("$and/$or/$nor must be nonempty array");
    var subSelectorFunctions = _.map(subSelector, function (selector) {
      return compileDocumentSelector(selector, cursor);
    });
    return function (doc, wholeDoc) {
      return _.all(subSelectorFunctions, function (f) {
        return !f(doc, wholeDoc).result;
      });
    };
  },

  "$where": function(selectorValue) {
    if (!(selectorValue instanceof Function)) {
      // XXX MongoDB seems to have more complex logic to decide where or or not
      // to add "return"; not sure exactly what it is.
      selectorValue = Function("obj", "return " + selectorValue);
    }
    return function (doc) {
      // We make the document available as both `this` and `obj`.
      // XXX not sure what we should do if this throws
      return selectorValue.call(doc, doc);
    };
  },

  "$comment": function () {
    return function () {
      return true;
    };
  }
};

// Each value operator is a function with args:
//  - operand - Anything
//  - operators - Object - operators on the same level (neighbours)
//  - cursor - Object - original cursor
// returns a function with args:
//  - value - a value the operator is tested against
//  - doc - the whole document tested in this query
var VALUE_OPERATORS = {
  "$in": function (operand) {
    if (!isArray(operand))
      throw new Error("Argument to $in must be array");
    return function (value) {
      return _anyIfArrayPlus(value, function (x) {
        return _.any(operand, function (operandElt) {
          return LocalCollection._f._equal(operandElt, x);
        });
      });
    };
  },

  "$all": function (operand) {
    if (!isArray(operand))
      throw new Error("Argument to $all must be array");
    return function (value) {
      if (!isArray(value))
        return false;
      return _.all(operand, function (operandElt) {
        return _.any(value, function (valueElt) {
          return LocalCollection._f._equal(operandElt, valueElt);
        });
      });
    };
  },

  "$lt": function (operand) {
    return function (value) {
      return _anyIfArray(value, function (x) {
        return LocalCollection._f._cmp(x, operand) < 0;
      });
    };
  },

  "$lte": function (operand) {
    return function (value) {
      return _anyIfArray(value, function (x) {
        return LocalCollection._f._cmp(x, operand) <= 0;
      });
    };
  },

  "$gt": function (operand) {
    return function (value) {
      return _anyIfArray(value, function (x) {
        return LocalCollection._f._cmp(x, operand) > 0;
      });
    };
  },

  "$gte": function (operand) {
    return function (value) {
      return _anyIfArray(value, function (x) {
        return LocalCollection._f._cmp(x, operand) >= 0;
      });
    };
  },

  "$ne": function (operand) {
    return function (value) {
      return ! _anyIfArrayPlus(value, function (x) {
        return LocalCollection._f._equal(x, operand);
      });
    };
  },

  "$nin": function (operand) {
    if (!isArray(operand))
      throw new Error("Argument to $nin must be array");
    var inFunction = VALUE_OPERATORS.$in(operand);
    return function (value, doc) {
      // Field doesn't exist, so it's not-in operand
      if (value === undefined)
        return true;
      return !inFunction(value, doc);
    };
  },

  "$exists": function (operand) {
    return function (value) {
      return operand === (value !== undefined);
    };
  },

  "$mod": function (operand) {
    var divisor = operand[0],
        remainder = operand[1];
    return function (value) {
      return _anyIfArray(value, function (x) {
        return x % divisor === remainder;
      });
    };
  },

  "$size": function (operand) {
    return function (value) {
      return isArray(value) && operand === value.length;
    };
  },

  "$type": function (operand) {
    return function (value) {
      // A nonexistent field is of no type.
      if (value === undefined)
        return false;
      // Definitely not _anyIfArrayPlus: $type: 4 only matches arrays that have
      // arrays as elements according to the Mongo docs.
      return _anyIfArray(value, function (x) {
        return LocalCollection._f._type(x) === operand;
      });
    };
  },

  "$regex": function (operand, operators) {
    var options = operators.$options;
    if (options !== undefined) {
      // Options passed in $options (even the empty string) always overrides
      // options in the RegExp object itself. (See also
      // Meteor.Collection._rewriteSelector.)

      // Be clear that we only support the JS-supported options, not extended
      // ones (eg, Mongo supports x and s). Ideally we would implement x and s
      // by transforming the regexp, but not today...
      if (/[^gim]/.test(options))
        throw new Error("Only the i, m, and g regexp options are supported");

      var regexSource = operand instanceof RegExp ? operand.source : operand;
      operand = new RegExp(regexSource, options);
    } else if (!(operand instanceof RegExp)) {
      operand = new RegExp(operand);
    }

    return function (value) {
      if (value === undefined)
        return false;
      return _anyIfArray(value, function (x) {
        return operand.test(x);
      });
    };
  },

  "$options": function (operand) {
    // evaluation happens at the $regex function above
    return function (value) { return true; };
  },

  "$elemMatch": function (operand, selector, cursor) {
    var matcher = compileDocumentSelector(operand, cursor);
    return function (value, doc) {
      if (!isArray(value))
        return false;
      return _.any(value, function (x) {
        return matcher(x, doc).result;
      });
    };
  },

  "$not": function (operand, operators, cursor) {
    var matcher = compileValueSelector(operand, operators, cursor);
    return function (value, doc) {
      return !matcher(value, doc);
    };
  },

  "$near": function (operand, operators, cursor) {
    function distanceCoordinatePairs (a, b) {
      a = pointToArray(a);
      b = pointToArray(b);
      var x = a[0] - b[0];
      var y = a[1] - b[1];
      if (_.isNaN(x) || _.isNaN(y))
        return null;
      return Math.sqrt(x * x + y * y);
    }
    // Makes sure we get 2 elements array and assume the first one to be x and
    // the second one to y no matter what user passes.
    // In case user passes { lon: x, lat: y } returns [x, y]
    function pointToArray (point) {
      return _.map(point, _.identity);
    }
    // GeoJSON query is marked as $geometry property
    var mode = _.isObject(operand) && _.has(operand, '$geometry') ? "2dsphere" : "2d";
    var maxDistance = mode === "2d" ? operators.$maxDistance : operand.$maxDistance;
    var point = mode === "2d" ? operand : operand.$geometry;
    return function (value, doc) {
      var dist = null;
      switch (mode) {
        case "2d":
          dist = distanceCoordinatePairs(point, value);
          break;
        case "2dsphere":
          // XXX: for now, we don't calculate the actual distance between, say,
          // polygon and circle. If people care about this use-case it will get
          // a priority.
          if (value.type === "Point")
            dist = GeoJSON.pointDistance(point, value);
          else
            dist = GeoJSON.geometryWithinRadius(value, point, maxDistance) ?
                     0 : maxDistance + 1;
          break;
      }
      // Used later in sorting by distance, since $near queries are sorted by
      // distance from closest to farthest.
      if (cursor) {
        if (!cursor._distance)
          cursor._distance = {};
        cursor._distance[doc._id] = dist;
      }

      // Distance couldn't parse a geometry object
      if (dist === null)
        return false;

      return maxDistance === undefined ? true : dist <= maxDistance;
    };
  },

  "$maxDistance": function () {
    // evaluation happens in the $near operator
    return function () { return true; }
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
  return (LocalCollection._compileSelector(selector))(doc).result;
};


// string can be converted to integer
numericKey = function (s) {
  return /^[0-9]+$/.test(s);
};

// XXX redoc
// XXX be aware that _compileSort currently assumes that lookup functions
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

// The main compilation function for a given selector.
var compileDocumentSelector = function (docSelector, cursor) {
  var perKeySelectors = [];
  _.each(docSelector, function (subSelector, key) {
    if (key.substr(0, 1) === '$') {
      // Outer operators are either logical operators (they recurse back into
      // this function), or $where.
      if (!_.has(LOGICAL_OPERATORS, key))
        throw new Error("Unrecognized logical operator: " + key);
      perKeySelectors.push(
        LOGICAL_OPERATORS[key](subSelector, docSelector, cursor));
    } else {
      var lookUpByIndex = LocalCollection._makeLookupFunction(key);
      var valueSelectorFunc =
        compileValueSelector(subSelector, docSelector, cursor);
      perKeySelectors.push(function (doc, wholeDoc) {
        var branchValues = lookUpByIndex(doc);
        // We apply the selector to each "branched" value and return true if any
        // match. However, for "negative" selectors like $ne or $not we actually
        // require *all* elements to match.
        //
        // This is because {'x.tag': {$ne: "foo"}} applied to {x: [{tag: 'foo'},
        // {tag: 'bar'}]} should NOT match even though there is a branch that
        // matches. (This matches the fact that $ne uses a negated
        // _anyIfArrayPlus, for when the last level of the key is the array,
        // which deMorgans into an 'all'.)
        //
        // XXX This isn't 100% consistent with MongoDB in 'null' cases:
        //     https://jira.mongodb.org/browse/SERVER-8585
        // XXX this still isn't right.  consider {a: {$ne: 5, $gt: 6}}. the
        //     $ne needs to use the "all" logic and the $gt needs the "any"
        //     logic
        var combiner = (subSelector &&
                        (subSelector.$not || subSelector.$ne ||
                         subSelector.$nin))
              ? _.all : _.any;
        return combiner(branchValues, function (val) {
          return valueSelectorFunc(val, wholeDoc);
        });
      });
    }
  });

  return andCompiledDocumentSelectors(perKeySelectors);
};

// Given a selector, return a function that takes one argument, a
// document. It returns an object with fields
//    - result: bool, true if the document matches the selector
// XXX add "arrayIndex" for use by update with '$'
LocalCollection._compileSelector = function (selector, cursor) {
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

  // XXX get rid of second argument once _distance refactored
  var s = compileDocumentSelector(selector, cursor);
  return function (doc) {
    return s(doc, doc);
  };
};

var matchesNothingSelector = function (doc) {
  return {result: false};
};

var andCompiledDocumentSelectors = function (selectors) {
  // XXX simplify to not involve 'arguments' once _distance is refactored
  return function (/*doc, sometimes wholeDoc*/) {
    var args = _.toArray(arguments);
    // XXX take arrayIndex, etc into account
    var result = _.all(selectors, function (f) {
      // XXX once sub-selectors return structed thing, add '.result' here
      return f.apply(null, args);
    });
    return {result: result};
  };
};
