LocalCollection._contains = function (list, obj) {
  if (!(_.contains(list, obj))) {
    for (var i = 0, len_i = list.length; i < len_i; i++) {
      if (JSON.stringify(obj) === JSON.stringify(list[i]))
        return true;
    }
    return false;
  } else {
    return true;
  }
}

LocalCollection._gt = function (otherVal, val) {
  if ((val === null) || (otherVal === null)) {
    return true;
  } else if (_.isArray(otherVal)) {
    // XXX: check if val is array, semantics?
    return _.max(otherVal) > val;
  } else if (_.isObject(otherVal) && _.isObject(val)) {
    // XXX: find material about actual semantics
    minOtherVal = _.min(_.flatten(_.values(otherVal)));
    minVal = _.min(_.flatten(_.values(val)));
    return minOtherVal > minVal;
  } else {
    return otherVal > val;
  }

}

LocalCollection._lt = function (otherVal, val) {
  if ((val === null) || (otherVal === null)) {
    return true;
  } else if (_.isArray(otherVal)) {
    return _.min(otherVal) < val;
  } else if (_.isObject(otherVal) && _.isObject(val)) {
    minOtherVal = _.min(_.flatten(_.values(otherVal)));
    minVal = _.min(_.flatten(_.values(val)));
    return minOtherVal < minVal;
  } else {
    return otherVal < val;
  }

}

LocalCollection._checkType = function(type, value) {
  switch (type) {
    case 1:
      return typeof value === "number";
    case 2:
      return typeof value === "string";
    case 3:
      return value instanceof Object;
    case 4:
      return value instanceof Array;
    case 8:
      return typeof value === "boolean";
    case 10:
      return value === null;
    case 11:
      return value instanceof RegExp
    case 13:
      return typeof value === "function"
    default:
      return false;
    // XXX support some/all of these:
    // 5, binary data
    // 7, object id
    // 9, date
    // 14, symbol
    // 15, javascript code with scope
    // 16, 18: 32-bit/64-bit integer
    // 17, timestamp
    // 255, minkey
    // 127, maxkey
  }
}

LocalCollection._selectorOperators = {
  "$in": function(key, selectorValue, docBranch) {
    if (!(LocalCollection._contains(selectorValue, docBranch))) {
      if (_.isArray(docBranch)) {
        for (var i = 0, len_i = docBranch.length; i < len_i; i++) {
          if (LocalCollection._contains(selectorValue, docBranch[i]))
            return true;
        }
      } else {
        return false;
      }
    } else {
      return true;
    }
  },

  "$all": function(key, selectorValue, docBranch) {
    if (!_.isArray(docBranch)) {
      docBranch = [docBranch];
    }
    for (var i = 0, len_i = selectorValue.length; i < len_i; i++) {
      if (!(LocalCollection._contains(docBranch, selectorValue[i]))) {
        return false;
      }
    }
    return true;
  },

  "$lt": function(key, selectorValue, docBranch) {
    return LocalCollection._lt(docBranch, selectorValue, _.min);
  },

  "$lte": function(key, selectorValue, docBranch) {
    return (_.isEqual(selectorValue, docBranch)) || LocalCollection._lt(docBranch, selectorValue);
  },

  "$gt": function(key, selectorValue, docBranch) {
    return LocalCollection._gt(docBranch, selectorValue);
   },

  "$gte": function(key, selectorValue, docBranch) {
    return (_.isEqual(selectorValue, docBranch)) || LocalCollection._gt(docBranch, selectorValue);
  },

  "$ne": function(key, selectorValue, docBranch) {
    if (_.contains(["number", "string", "boolean"], typeof selectorValue)) {
      return !(selectorValue === docBranch || _.contains(docBranch, selectorValue))
    } else {
      if (JSON.stringify(selectorValue) === JSON.stringify(docBranch)) {
        return false;
      } else {
        if (_.isArray(docBranch))
          return !LocalCollection._contains(docBranch, selectorValue)
        return true;
      }
    }
  },

  "$nin": function(key, selectorValue, docBranch) {
    return !LocalCollection._selectorOperators["$in"](key, selectorValue, docBranch);
  },

  "$exists": function(key, selectorValue, docBranch) {
    return (selectorValue && (docBranch !== undefined)) || (!selectorValue && (docBranch === undefined))
  },

  "$mod": function(key, selectorValue, docBranch) {
    if (_.isArray(docBranch)) {
      for (var i = 0, len_i = docBranch.length; i < len_i; i++) {
        if (docBranch[i] % selectorValue[0] === selectorValue[1])
          return true;
      }
    } else {
      return docBranch % selectorValue[0] === selectorValue[1];
    }
  },

  "$and": function(key, selectorValue, docBranch) {
    if (selectorValue.length === 0 && _.isArray(selectorValue))
      throw Error("$and/$or/$nor must be nonempty array");
    for (var i = 0, len_i = selectorValue.length; i < len_i; i++) {
      if (!(LocalCollection._evaluateSelector(null, selectorValue[i], docBranch))) {
        return false;
      }
    }
    return true;
  },

  "$or": function(key, selectorValue, docBranch) {
    if (selectorValue.length === 0 && _.isArray(selectorValue))
      throw Error("$and/$or/$nor must be nonempty array");
    for (var i = 0, len_i = selectorValue.length; i < len_i; i++) {
      if (LocalCollection._evaluateSelector(null, selectorValue[i], docBranch)) {
        return true;
      }
    }
    return false;
  },

  "$nor": function(key, selectorValue, docBranch) {
    if (selectorValue.length === 0 && _.isArray(selectorValue))
      throw Error("$and/$or/$nor must be nonempty array");
    for (var i = 0, len_i = selectorValue.length; i < len_i; i++) {
      if (LocalCollection._evaluateSelector(null, selectorValue[i], docBranch)) {
        return false;
      }
    }
    return true;
  },
  
  "$not": function(key, selectorValue, docBranch, selectorBranch) {
    if (_.isObject(selectorValue) && !_.isArray(selectorValue) && !(selectorValue instanceof RegExp)) {
      return !(LocalCollection._evaluateSelector(key, selectorValue, docBranch));
    } else {
      if (selectorValue instanceof RegExp) {
        return !(selectorValue.test(docBranch))
      }
      throw Error("Invalid use of $not (you may want to use $ne or $nin)");
    }
  },

  "$size": function(key, selectorValue, docBranch) {
    if (_.isObject(docBranch)) {
      return selectorValue === _.size(docBranch);
    } else {
      return false;
    }
  },

  "$type": function(key, selectorValue, docBranch) {
    if (_.isArray(docBranch)) {
      for (var i = 0, len_i = docBranch.length; i < len_i; i++) {
        if (LocalCollection._checkType(selectorValue, docBranch[i]))
          return true;
      }
      return false;
    } else {
      return LocalCollection._checkType(selectorValue, docBranch);
    }
  },

  "$regex": function(key, selectorValue, docBranch, selectorBranch) {
    var options;
    if ("$options" in selectorBranch)
      options = selectorBranch["$options"];
    if (selectorValue instanceof RegExp) {
      if (options === undefined) {
        return selectorValue.test(docBranch);
      } else {
        // If there are options given with $options, we use them instead
        // and construct the rexeg anew from its .source.
        return new RegExp(selectorValue.source, options).test(docBranch);
      }
    } else {
      return new RegExp(selectorValue, options).test(docBranch);
    }
  },

  "$options": function(key, selectorValue, docBranch) {
    // evaluation happens at the $regex function above
    return true;
  },

  "$where": function(key, selectorValue, docBranch) {
    return Function("return " + selectorValue).call(docBranch);
  },

  "$elemMatch": function(key, selectorValue, docBranch) {
    console.log (selectorValue, docBranch);
    for (var i = 0, len_i = docBranch.length; i < len_i; i++) {
      if (LocalCollection._evaluateSelector(key, selectorValue, docBranch[i]))
        return true;
    }
    return false;
  }

};


// helpers used by compiled selector code
LocalCollection._f = {
  // XXX for _all and _in, consider building 'inquery' at compile time..

  _all: function (x, qval) {
    // $all is only meaningful on arrays
    if (!(x instanceof Array)) {
      return false;
    }
    // XXX should use a canonicalizing representation, so that we
    // don't get screwed by key order
    var parts = {};
    var remaining = 0;
    _.each(qval, function (q) {
      var hash = JSON.stringify(q);
      if (!(hash in parts)) {
        parts[hash] = true;
        remaining++;
      }
    });

    for (var i = 0; i < x.length; i++) {
      var hash = JSON.stringify(x[i]);
      if (parts[hash]) {
        delete parts[hash];
        remaining--;
        if (0 === remaining)
          return true;
      }
    }

    return false;
  },

  _in: function (x, qval) {
    if (typeof x !== "object") {
      // optimization: use scalar equality (fast)
      for (var i = 0; i < qval.length; i++)
        if (x === qval[i])
          return true;
      return false;
    } else {
      // nope, have to use deep equality
      for (var i = 0; i < qval.length; i++)
        if (LocalCollection._f._equal(x, qval[i]))
          return true;
      return false;
    }
  },

  _type: function (v) {
    if (typeof v === "number")
      return 1;
    if (typeof v === "string")
      return 2;
    if (typeof v === "boolean")
      return 8;
    if (v instanceof Array)
      return 4;
    if (v === null)
      return 10;
    if (v instanceof RegExp)
      return 11;
    if (typeof v === "function")
      // note that typeof(/x/) === "function"
      return 13;
    return 3; // object

    // XXX support some/all of these:
    // 5, binary data
    // 7, object id
    // 9, date
    // 14, symbol
    // 15, javascript code with scope
    // 16, 18: 32-bit/64-bit integer
    // 17, timestamp
    // 255, minkey
    // 127, maxkey
  },

  // deep equality test: use for literal document and array matches
  _equal: function (x, qval) {
    var match = function (a, b) {
      // scalars
      if (typeof a === 'number' || typeof a === 'string' ||
          typeof a === 'boolean' || a === undefined || a === null)
        return a === b;
      if (typeof a === 'function')
        return false;

      // OK, typeof a === 'object'
      if (typeof b !== 'object')
        return false;

      // arrays
      if (a instanceof Array) {
        if (!(b instanceof Array))
          return false;
        if (a.length !== b.length)
          return false;
        for (var i = 0; i < a.length; i++)
          if (!match(a[i],b[i]))
            return false;
        return true;
      }

      // objects
/*
      var unmatched_b_keys = 0;
      for (var x in b)
        unmatched_b_keys++;
      for (var x in a) {
        if (!(x in b) || !match(a[x], b[x]))
          return false;
        unmatched_b_keys--;
      }
      return unmatched_b_keys === 0;
*/
      // Follow Mongo in considering key order to be part of
      // equality. Key enumeration order is actually not defined in
      // the ecmascript spec but in practice most implementations
      // preserve it. (The exception is Chrome, which preserves it
      // usually, but not for keys that parse as ints.)
      var b_keys = [];
      for (var x in b)
        b_keys.push(x);
      var i = 0;
      for (var x in a) {
        if (i >= b_keys.length)
          return false;
        if (x !== b_keys[i])
          return false;
        if (!match(a[x], b[b_keys[i]]))
          return false;
        i++;
      }
      if (i !== b_keys.length)
        return false;
      return true;
    };
    return match(x, qval);
  },

  // if x is not an array, true iff f(x) is true. if x is an array,
  // true iff f(y) is true for any y in x.
  //
  // this is the way most mongo operators (like $gt, $mod, $type..)
  // treat their arguments.
  _matches: function (x, f) {
    if (x instanceof Array) {
      for (var i = 0; i < x.length; i++)
        if (f(x[i]))
          return true;
      return false;
    }
    return f(x);
  },

  // like _matches, but if x is an array, it's true not only if f(y)
  // is true for some y in x, but also if f(x) is true.
  //
  // this is the way mongo value comparisons usually work, like {x:
  // 4}, {x: [4]}, or {x: {$in: [1,2,3]}}.
  _matches_plus: function (x, f) {
    if (x instanceof Array) {
      for (var i = 0; i < x.length; i++)
        if (f(x[i]))
          return true;
      // fall through!
    }
    return f(x);
  },

  // maps a type code to a value that can be used to sort values of
  // different types
  _typeorder: function (t) {
    // http://www.mongodb.org/display/DOCS/What+is+the+Compare+Order+for+BSON+Types
    // XXX what is the correct sort position for Javascript code?
    // ('100' in the matrix below)
    // XXX minkey/maxkey
    return [-1, 1, 2, 3, 4, 5, -1, 6, 7, 8, 0, 9, -1, 100, 2, 100, 1,
            8, 1][t];
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
      // XXX need to implement this once we implement Symbol or
      // integers, or once we implement both Date and Timestamp
      throw Error("Missing type coercion logic in _cmp");
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
      }
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
    // 5: binary data
    // 7: object id
    if (ta === 8) { // boolean
      if (a) return b ? 0 : 1;
      return b ? -1 : 0;
    }
    // 9: date
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
  }
};

// For unit tests. True if the given document matches the given
// selector.
LocalCollection._matches = function (selector, doc) {
  return (LocalCollection._compileSelector(selector))(doc);
};

// The main evaluation function for a given selector. Can be called recursively
// for things like logical operators ($and/$or/$nor), dot-notation (people.2.name)
// and such. Works by looping over the keys in the selector object, checking if
// it's an operator (in which case it delegates to the _selectorOperators hash
// table), dot-notation (which causes it to evaluate the level after the first
// dot), or anything else. It then compares (or checks for containment in
// an array) the values of the selector and the document for that key, respectively.
LocalCollection._evaluateSelector = function(outerKey, selectorBranch, docBranch) {
  for (var innerKey in selectorBranch) {
    var selectorValue = selectorBranch[innerKey];
    if (innerKey.charAt(0) === "$") {
      // It's an operator, so let's user our operator dispatch hash table to evaluate it.
      // We have to pass selectorBranch, even though only $regex uses it for access
      // to $options (really ugly syntax there).
      if (!LocalCollection._selectorOperators[innerKey](outerKey, selectorValue, docBranch, selectorBranch))
        return false;
    } else if (innerKey.indexOf(".") >= 0) {
      // If the innerKey uses dot-notation, we move up one layer and recurse.
      // Somehow, this magically works with reaching into arrays as well.
      var keyParts = innerKey.split(".");
      var firstPart = keyParts.shift();
      if (!(firstPart in docBranch))
        return false;
      var newSelectorBranch = {};
      newSelectorBranch[keyParts.join(".")] = selectorValue;
      if(!(LocalCollection._evaluateSelector(null, newSelectorBranch, docBranch[firstPart])))
        return false;
    } else {
      // From here on, it's not operator or dot-notation territory.
      var docValue = docBranch[innerKey];
      // Check if there are any operators left, or if it's a normal object.
      var _continueIteration = false;
      if (_.isObject(selectorValue) && !(selectorValue instanceof RegExp) && !_.isArray(selectorValue)) {
        for (var selKey in selectorValue) {
          if (selKey.charAt(0) === "$") {
            // There are operators in the object, so let's recurse into it.
            _continueIteration = true;
            if (!(LocalCollection._evaluateSelector(innerKey, selectorValue, docValue)))
              return false;
            break;
          }
        }
        if (_continueIteration)
          continue;
      }

      // No recursion possible anymore, just comparison or containment.
      if (!(docValue === selectorValue || _.contains(docValue, selectorValue))) {
        // if it's not a simple comparison or array-containment checking,
        // it could be a regex ... 
        if (selectorValue instanceof RegExp) {
          if (!(selectorValue.test(docValue)))
            return false;
        // ... or if it's null, it's checking if a field doesn't exists,
        // or is null, or contains null ...
        } else if (selectorValue === null) {
          if (innerKey in docBranch && !(docValue === null) && !(_.contains(docValue, null)))
            return false;
        // or it's an object, so we use object comparison.
        } else {
          if (JSON.stringify(docValue) !== JSON.stringify(selectorValue)) {
            // Failing that, it could be an array ...
            if (_.isArray(docValue)) { 
              // It could be an array ...
              if (!(LocalCollection._contains(docValue, selectorValue)))
                return false;
            } else {
              // ... or just plain false.
              return false;
            }
          }
        }
      }
    }
  }
  // We should have returned whenever something evaluated to false,
  // so it must be true.
  return true;
};

// Given a selector, return a function that takes one argument, a
// document, and returns true if the document matches the selector,
// else false.
LocalCollection._compileSelector = function (selector) {
  var literals = [];
  // you can pass a literal function instead of a selector
  if (selector instanceof Function)
    return function (doc) {return selector.call(doc);};

  // shorthand -- scalars match _id
  if (LocalCollection._selectorIsId(selector))
    selector = {_id: selector};
  
  // protect against dangerous selectors.  falsey and {_id: falsey}
  // are both likely programmer error, and not what you want,
  // particularly for destructive operations.
  if (!selector || (('_id' in selector) && !selector._id))
    return function (doc) {return false;};

  var _func = function(doc) {
    return LocalCollection._evaluateSelector(null, selector, doc);
  };
  return _func;
};

// Is this selector just shorthand for lookup by _id?
LocalCollection._selectorIsId = function (selector) {
  return (typeof selector === "string") || (typeof selector === "number");
};
