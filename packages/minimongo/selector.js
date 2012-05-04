// helpers used by compiled selector code
LocalCollection._f = {
  // XXX for _all and _in, consider building 'inquery' at compile time..

  _all: function (x, qval) {
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
        b_keys.push(b[x]);
      var i = 0;
      for (var x in a) {
        if (i >= b_keys.length)
          return false;
        if (!match(a[x], b_keys[i]))
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

// Given a selector, return a function that takes one argument, a
// document, and returns true if the document matches the selector,
// else false.
LocalCollection._compileSelector = function (selector) {
  var literals = [];
  // you can pass a literal function instead of a selector
  if (selector instanceof Function)
    return function (doc) {return selector.call(doc);};

  // shorthand -- scalars match _id
  if ((typeof selector === "string") || (typeof selector === "number"))
    selector = {_id: selector};

  // protect against dangerous selectors.  falsey and {_id: falsey}
  // are both likely programmer error, and not what you want,
  // particularly for destructive operations.
  if (!selector || (('_id' in selector) && !selector._id))
    return function (doc) {return false;};

  // eval() does not return a value in IE8, nor does the spec say it
  // should. Assign to a local to get the value, instead.
  var _func;
  eval("_func = (function(f,literals){return function(doc){return " +
       LocalCollection._exprForSelector(selector, literals) +
       ";};})");
  return _func(LocalCollection._f, literals);
};

// XXX implement ordinal indexing: 'people.2.name'

// Given an arbitrary Mongo-style query selector, return an expression
// that evaluates to true if the document in 'doc' matches the
// selector, else false.
LocalCollection._exprForSelector = function (selector, literals) {
  var clauses = [];
  for (var key in selector) {
    var value = selector[key];

    if (key.substr(0, 1) === '$') { // no indexing into strings on IE7
      // whole-document predicate like {$or: [{x: 12}, {y: 12}]}
      clauses.push(LocalCollection._exprForDocumentPredicate(key, value, literals));
    } else {
      // else, it's a constraint on a particular key (or dotted keypath)
      clauses.push(LocalCollection._exprForKeypathPredicate(key, value, literals));
    }
  };

  if (clauses.length === 0) return 'true'; // selector === {}
  return '(' + clauses.join('&&') +')';
};

// 'op' is a top-level, whole-document predicate from a mongo
// selector, like '$or' in {$or: [{x: 12}, {y: 12}]}. 'value' is its
// value in the selector. Return an expression that evaluates to true
// if 'doc' matches this predicate, else false.
LocalCollection._exprForDocumentPredicate = function (op, value, literals) {
  if (op === '$or') {
    var clauses = [];
    _.each(value, function (c) {
      clauses.push(LocalCollection._exprForSelector(c, literals));
    });
    if (clauses.length === 0) return 'true';
    return '(' + clauses.join('||') +')';
  }

  if (op === '$and') {
    var clauses = [];
    _.each(value, function (c) {
      clauses.push(LocalCollection._exprForSelector(c, literals));
    });
    if (clauses.length === 0) return 'true';
    return '(' + clauses.join('&&') +')';
  }

  if (op === '$nor') {
    var clauses = [];
    _.each(value, function (c) {
      clauses.push("!(" + LocalCollection._exprForSelector(c, literals) + ")");
    });
    if (clauses.length === 0) return 'true';
    return '(' + clauses.join('&&') +')';
  }

  if (op === '$where') {
    if (value instanceof Function) {
      literals.push(value);
      return 'literals[' + (literals.length - 1) + '].call(doc)';
    }
    return "(function(){return " + value + ";}).call(doc)";
  }

  throw Error("Unrecogized key in selector: ", op);
}

// Given a single 'dotted.key.path: value' constraint from a Mongo
// query selector, return an expression that evaluates to true if the
// document in 'doc' matches the constraint, else false.
LocalCollection._exprForKeypathPredicate = function (keypath, value, literals) {
  var keyparts = keypath.split('.');

  // get the inner predicate expression
  var predcode = '';
  if (value instanceof RegExp) {
    predcode = LocalCollection._exprForOperatorTest(value, literals);
  } else if ( !(typeof value === 'object')
              || value === null
              || value instanceof Array) {
    // it's something like {x.y: 12} or {x.y: [12]}
    predcode = LocalCollection._exprForValueTest(value, literals);
  } else {
    // is it a literal document or a bunch of $-expressions?
    var is_literal = true;
    for (var k in value) {
      if (k.substr(0, 1) === '$') { // no indexing into strings on IE7
        is_literal = false;
        break;
      }
    }

    if (is_literal) {
      // it's a literal document, like {x.y: {a: 12}}
      predcode = LocalCollection._exprForValueTest(value, literals);
    } else {
      predcode = LocalCollection._exprForOperatorTest(value, literals);
    }
  }

  // now, deal with the orthogonal concern of dotted.key.paths and the
  // (potentially multi-level) array searching they require
  var ret = '';
  var innermost = true;
  while (keyparts.length) {
    var part = keyparts.pop();
    var formal = keyparts.length ? "x" : "doc";
    if (innermost) {
      ret = '(function(x){return ' + predcode + ';})(' + formal + '[' +
        JSON.stringify(part) + '])';
      innermost = false;
    } else {
      // for all but the innermost level of a dotted expression,
      // if the runtime type is an array, search it
      ret = 'f._matches(' + formal + '[' + JSON.stringify(part) +
        '], function(x){return ' + ret + ';})';
    }
  }

  return ret;
};

// Given a value, return an expression that evaluates to true if the
// value in 'x' matches the value, or else false. This includes
// searching 'x' if it is an array. This doesn't include regular
// expressions (that's because mongo's $not operator works with
// regular expressions but not other kinds of scalar tests.)
LocalCollection._exprForValueTest = function (value, literals) {
  var expr;

  if (value === null) {
    // null has special semantics
    // http://www.mongodb.org/display/DOCS/Querying+and+nulls
    expr = 'x===null||x===undefined';
  } else if (typeof value === 'string' ||
             typeof value === 'number' ||
             typeof value === 'boolean') {
    // literal scalar value
    // XXX object ids, dates, timestamps?
    expr = 'x===' + JSON.stringify(value);
  } else if (typeof value === 'function') {
    // note that typeof(/a/) === 'function' in javascript
    // XXX improve error
    throw Error("Bad value type in query");
  } else {
    // array or literal document
    expr = 'f._equal(x,' + JSON.stringify(value) + ')';
  }

  return 'f._matches_plus(x,function(x){return ' + expr + ';})';
};

// In a selector like {x: {$gt: 4, $lt: 8}}, we're calling the {$gt:
// 4, $lt: 8} part an "operator." Given an operator, return an
// expression that evaluates to true if the value in 'x' matches the
// operator, or else false. This includes searching 'x' if necessary
// if it's an array. In {x: /a/}, we consider /a/ to be an operator.
LocalCollection._exprForOperatorTest = function (op, literals) {
  if (op instanceof RegExp) {
    return LocalCollection._exprForOperatorTest({$regex: op}, literals);
  } else {
    var clauses = [];
    for (var type in op)
      clauses.push(LocalCollection._exprForConstraint(type, op[type],
                                                      op, literals));
    if (clauses.length === 0)
      return 'true';
    return '(' + clauses.join('&&') + ')';
  }
};

// In an operator like {$gt: 4, $lt: 8}, we call each key/value pair,
// such as $gt: 4, a constraint. Given a constraint and its arguments,
// return an expression that evaluates to true if the value in 'x'
// matches the constraint, or else false. This includes searching 'x'
// if it's an array (and it's appropriate to the constraint.)
LocalCollection._exprForConstraint = function (type, arg, others,
                                               literals) {
  var expr;
  var search = '_matches';
  var negate = false;

  if (type === '$gt') {
    expr = 'f._cmp(x,' + JSON.stringify(arg) + ')>0';
  } else if (type === '$lt') {
    expr = 'f._cmp(x,' + JSON.stringify(arg) + ')<0';
  } else if (type === '$gte') {
    expr = 'f._cmp(x,' + JSON.stringify(arg) + ')>=0';
  } else if (type === '$lte') {
    expr = 'f._cmp(x,' + JSON.stringify(arg) + ')<=0';
  } else if (type === '$all') {
    expr = 'f._all(x,' + JSON.stringify(arg) + ')';
    search = null;
  } else if (type === '$exists') {
    if (arg)
      expr = 'x!==undefined';
    else
      expr = 'x===undefined';
    search = null;
  } else if (type === '$mod') {
    expr = 'x%' + JSON.stringify(arg[0]) + '===' +
      JSON.stringify(arg[1]);
  } else if (type === '$ne') {
    if (typeof arg !== "object")
      expr = 'x===' + JSON.stringify(arg);
    else
      expr = 'f._equal(x,' + JSON.stringify(arg) + ')';
    search = '_matches_plus';
    negate = true; // tricky
  } else if (type === '$in') {
    expr = 'f._in(x,' + JSON.stringify(arg) + ')';
    search = '_matches_plus';
  } else if (type === '$nin') {
    expr = 'f._in(x,' + JSON.stringify(arg) + ')';
    search = '_matches_plus';
    negate = true;
  } else if (type === '$size') {
    expr = '(x instanceof Array)&&x.length===' + arg;
    search = null;
  } else if (type === '$type') {
    // $type: 1 is true for an array if any element in the array is of
    // type 1. but an array doesn't have type array unless it contains
    // an array..
    expr = 'f._type(x)===' + JSON.stringify(arg);
  } else if (type === '$regex') {
    // XXX mongo uses PCRE and supports some additional flags: 'x' and
    // 's'. javascript doesn't support them. so this is a divergence
    // between our behavior and mongo's behavior. ideally we would
    // implement x and s by transforming the regexp, but not today..
    if ('$options' in others && /[^gim]/.test(others['$options']))
      throw Error("Only the i, m, and g regexp options are supported");
    expr = 'literals[' + literals.length + '].test(x)';
    if (arg instanceof RegExp) {
      if ('$options' in others) {
        literals.push(new RegExp(arg.source, others['$options']));
      } else {
        literals.push(arg);
      }
    } else {
      literals.push(new RegExp(arg, others['$options']));
    }
  } else if (type === '$options') {
    expr = 'true';
    search = null;
  } else if (type === '$elemMatch') {
    // XXX implement
    throw Error("$elemMatch unimplemented");
  } else if (type === '$not') {
    // mongo doesn't support $regex inside a $not for some reason. we
    // do, because there's no reason not to that I can see.. but maybe
    // we should follow mongo's behavior?
    expr = '!' + LocalCollection._exprForOperatorTest(arg, literals);
    search = null;
  } else {
    throw Error("Unrecognized key in selector: " + type);
  }

  if (search) {
    expr = 'f.' + search + '(x,function(x){return ' +
      expr + ';})';
  }

  if (negate)
    expr = '!' + expr;

  return expr;
};
