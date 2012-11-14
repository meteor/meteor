LocalCollection._contains = function (list, obj) {
  var objStr = JSON.stringify(obj);
  for (var i = 0, len_i = list.length; i < len_i; i++) {
    if (objStr === JSON.stringify(list[i]))
      return true;
  }
  return false;
}

LocalCollection._containsSome = function (list, otherList) {
  for (var i = 0, len_i = list.length; i < len_i; i++) {
    var listObjStr = JSON.stringify(list[i]);
    for (var j = 0, len_j = otherList.length; j < len_j; j++) {
      if (listObjStr === JSON.stringify(otherList[j]))
        return true;
     }
  }
  return false;
}

LocalCollection._containsAll = function (list, otherList) {
  for (var i = 0, len_i = list.length; i < len_i; i++) {
    var listObjStr = JSON.stringify(list[i]);
    var matches = false;
    for (var j = 0, len_j = otherList.length; j < len_j; j++) {
      if (listObjStr === JSON.stringify(otherList[j])) {
        matches = true;
        break;
      }
    }
    if (!matches)
      return false;
  }
  return true;
}

LocalCollection._gt = function (otherVal, val) {
  if ((val === null) || (otherVal === null)) {
    return true;
  } else if (_.isObject(otherVal) && _.isObject(val)) {
    // XXX: find material about actual semantics
    var minOtherVal = _.min(_.flatten(_.values(otherVal)));
    var minVal = _.min(_.flatten(_.values(val)));
    return minOtherVal > minVal;
  } else if (_.isArray(otherVal)) {
    return _.max(otherVal) > val;
  } else {
    return otherVal > val;
  }

}

LocalCollection._lt = function (otherVal, val) {
  if ((val === null) || (otherVal === null)) {
    return true;
  } else if (_.isObject(otherVal) && _.isObject(val)) {
    var minOtherVal = _.min(_.flatten(_.values(otherVal)));
    var minVal = _.min(_.flatten(_.values(val)));
    return minOtherVal < minVal;
  } else if (_.isArray(otherVal)) {
    return _.min(otherVal) < val;
  } else {
    return otherVal < val;
  }

}

LocalCollection._checkType = function(type, value) {
  switch (type) {
    case 1:
      return _.isNumber(value);
    case 2:
      return _.isString(value);
    case 3:
      return value instanceof Object;
    case 4:
      return _.isArray(value);
    case 8:
      return _.isBoolean(value)
    case 10:
      return value === null;
    case 11:
      return _.isRegExp(value);
    case 13:
      return _.isFunction(value);
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

LocalCollection._hasOperators = function(selectorValue) {
  for (var selKey in selectorValue) {
    if (selKey.charCodeAt(0) === 36) // $
      return true;
  }
  return false;
}

LocalCollection._evaluateSelectorValue = function(selectorValue, docValue) {
  if (!_.isObject(selectorValue)) {
    // Most common case: Primitive comparison or containment (e.g. `_id: <someId>`)
    return selectorValue === docValue || _.contains(docValue, selectorValue) ||
           selectorValue === null && docValue === undefined;
  } else {
    if (_.isArray(selectorValue)) {
      // Deep comparison or containment check.
      return JSON.stringify(selectorValue) === JSON.stringify(docValue) || LocalCollection._contains(docValue, selectorValue);
    } else if (_.isRegExp(selectorValue)) {
      return selectorValue.test(docValue);
    } else {
      // It's an object, but not an array or regexp.
      if (LocalCollection._hasOperators(selectorValue)) {
        // This one has operators in it, let's evaluate them.
        for (var selKey in selectorValue) {
          if (!LocalCollection._comparisonOperators[selKey](selectorValue[selKey], docValue, selectorValue))
            return false;
        }
        return true;
      } else {
        // There are no operators, so compare it to the document value
        // (via JSON.stringify, b/c that preserves key order).
        return JSON.stringify(selectorValue) === JSON.stringify(docValue) ||
               LocalCollection._contains(docValue, selectorValue);
      }
    }
  }
}

LocalCollection._logicalOperators = {
  "$and": function(selectorValue, docBranch) {
    if (selectorValue.length === 0)
      throw Error("$and/$or/$nor must be nonempty array");
    for (var i = 0, len_i = selectorValue.length; i < len_i; i++) {
      if (!(LocalCollection._evaluateSelector(selectorValue[i], docBranch)))
        return false;
    }
    return true;
  },

  "$or": function(selectorValue, docBranch) {
    if (selectorValue.length === 0)
      throw Error("$and/$or/$nor must be nonempty array");
    for (var i = 0, len_i = selectorValue.length; i < len_i; i++) {
      if (LocalCollection._evaluateSelector(selectorValue[i], docBranch))
        return true;
    }
    return false;
  },

  "$nor": function(selectorValue, docBranch) {
    if (selectorValue.length === 0)
      throw Error("$and/$or/$nor must be nonempty array");
    for (var i = 0, len_i = selectorValue.length; i < len_i; i++) {
      if (LocalCollection._evaluateSelector(selectorValue[i], docBranch))
        return false;
    }
    return true;
  },

  "$where": function(selectorValue, docBranch) {
    return Function("return " + selectorValue).call(docBranch);
  },
}

LocalCollection._comparisonOperators = {
  "$in": function(selectorValue, docValue) {
    return LocalCollection._contains(selectorValue, docValue) ||
           LocalCollection._containsSome(selectorValue, docValue);
  },

  "$all": function(selectorValue, docValue) {
    return _.isArray(selectorValue) && LocalCollection._containsAll(selectorValue, docValue) ||
           LocalCollection._contains(selectorValue, docValue);
  },

  "$lt": function(selectorValue, docValue) {
    return LocalCollection._lt(docValue, selectorValue);
  },

  "$lte": function(selectorValue, docValue) {
    return _.isEqual(selectorValue, docValue) || LocalCollection._lt(docValue, selectorValue);
  },

  "$gt": function(selectorValue, docValue) {
    return LocalCollection._gt(docValue, selectorValue);
   },

  "$gte": function(selectorValue, docValue) {
    return _.isEqual(selectorValue, docValue) || LocalCollection._gt(docValue, selectorValue);
  },

  "$ne": function(selectorValue, docValue) {
    return !(selectorValue === docValue ||
           JSON.stringify(selectorValue) === JSON.stringify(docValue) ||
           _.contains(docValue, selectorValue) &&
           LocalCollection._contains(docValue, selectorValue));
  },

  "$nin": function(selectorValue, docValue) {
    return docValue === undefined ||
           !(LocalCollection._contains(selectorValue, docValue)) &&
           !LocalCollection._containsSome(selectorValue, docValue);
  },

  "$exists": function(selectorValue, docValue) {
    return selectorValue === (docValue !== undefined)
  },

  "$mod": function(selectorValue, docValue) {
    var divisor = selectorValue[0],
        remainder = selectorValue[1]
    if (_.isArray(docValue)) {
      for (var i = 0, len_i = docValue.length; i < len_i; i++) {
        if (docValue[i] % divisor === remainder)
          return true;
      }
      return false;
    } else {
      return docValue % divisor === remainder;
    }
  },

  "$size": function(selectorValue, docValue) {
    return _.isArray(docValue) && selectorValue === docValue.length;
  },

  "$type": function(selectorValue, docValue) {
    if (_.isArray(docValue)) {
      for (var i = 0, len_i = docValue.length; i < len_i; i++) {
        if (LocalCollection._checkType(selectorValue, docValue[i]))
          return true;
      }
      return false;
    } else {
      return LocalCollection._checkType(selectorValue, docValue);
    }
  },

  "$regex": function(selectorValue, docValue, selectorBranch) {
    var options = selectorBranch["$options"];
    if (selectorValue instanceof RegExp) {
      if (options === undefined) {
        return selectorValue.test(docValue);
      } else {
        // If there are options given with $options, we use them instead
        // and construct the rexeg anew from its .source.
        return new RegExp(selectorValue.source, options).test(docValue);
      }
    } else {
      return new RegExp(selectorValue, options).test(docValue);
    }
  },

  "$options": function(selectorValue, docValue) {
    // evaluation happens at the $regex function above
    return true;
  },

  "$elemMatch": function(selectorValue, docValue) {
    for (var i = 0, len_i = docValue.length; i < len_i; i++) {
      if (LocalCollection._evaluateSelector(selectorValue, docValue[i]))
        return true;
    }
    return false;
  },
 
  "$not": function(selectorValue, docValue) {
    return !(LocalCollection._evaluateSelectorValue(selectorValue, docValue));
  },

}

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

// The main evaluation function for a given selector.
LocalCollection._evaluateSelector = function(selectorBranch, docBranch) {
  try {
    for (var innerKey in selectorBranch) {
      var selectorValue = selectorBranch[innerKey];
      if (innerKey.charCodeAt(0) === 36) { // $
        // Outer operators are either logigal operators (they recurse back into
        // this function), or $where.
       if (!LocalCollection._logicalOperators[innerKey](selectorValue, docBranch))
          return false;
      } else {
        if (innerKey.indexOf(".") >= 0) {
          // If the innerKey uses dot-notation, we move up to the last layer.
          // Somehow, this magically works with reaching into arrays as well.
          var keyParts = innerKey.split(".");
          var docValue = docBranch;
          for (var i = 0, len_i = keyParts.length; i < len_i; i++) {
            docValue = docValue[keyParts[i]];
          }
        } else {
          docValue = docBranch[innerKey];
        }
        // Here could be logical operators, containment, or comparisons.
        if (!LocalCollection._evaluateSelectorValue(selectorValue, docValue))
          return false;
      }
    }
  } catch (e) {
    // If type errors occur (like checking in a non-existing array),
    // we simply return false. Every other error is re-thrown.
    if (!(e instanceof TypeError))
      throw e
    return false;
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

  return function(doc) {return LocalCollection._evaluateSelector(selector, doc);};
};

// Is this selector just shorthand for lookup by _id?
LocalCollection._selectorIsId = function (selector) {
  return (typeof selector === "string") || (typeof selector === "number");
};
