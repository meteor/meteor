Spacebars = {};

// Returns true if `a` and `b` are `===`, unless they are of a mutable type.
// (Because then, they may be equal references to an object that was mutated,
// and we'll never know.  We save only a reference to the old object; we don't
// do any deep-copying or diffing.)
var safeEquals = function (a, b) {
  if (a !== b)
    return false;
  else
    return ((!a) || (typeof a === 'number') || (typeof a === 'boolean') ||
            (typeof a === 'string'));
};

Spacebars.include = function (kindOrFunc, args) {
  args = args || {};
  if (typeof kindOrFunc === 'function') {
    // function block helper
    var func = kindOrFunc;

    var hash = {};
    // Call arguments if they are functions.  This may cause
    // reactive dependencies!
    for (var k in args) {
      if (k !== 'data') {
        var v = args[k];
        hash[k] = (typeof v === 'function' ? v() : v);
      }
    }

    var result = Deps.isolateValue(function () {
      if ('data' in args) {
        var data = args.data;
        data = (typeof data === 'function' ? data() : data);
        return func(data, { hash: hash });
      } else {
        return func({ hash: hash });
      }
    });

    if (result !== null && !UI.isComponent(result))
      throw new Error("Expected null or template in return value from helper, found: " + result);

    // In `{{#foo}}...{{/foo}}`, if `foo` is a function that
    // returns a component, attach __content and __elseContent
    // to it.
    if (UI.isComponent(result) &&
        (('__content' in args) || ('__elseContent' in args))) {
      var extra = {};
      if ('__content' in args)
        extra.__content = args.__content;
      if ('__elseContent' in args)
        extra.__elseContent = args.__elseContent;
      result = result.extend(extra);
    }
    return result;
  } else {
    // Component
    var kind = kindOrFunc;
    if (! UI.isComponent(kind))
      throw new Error("Expected template, found: " + kind);

    // Note that there are no reactive dependencies established here.
    if (args) {
      var emboxedArgs = {};
      for (var k in args) {
        if (k === '__content' || k === '__elseContent')
          emboxedArgs[k] = args[k];
        else
          emboxedArgs[k] = UI.emboxValue(args[k], safeEquals);
      }

      return kind.extend(emboxedArgs);
    } else {
      return kind;
    }
  }
};


// Executes `{{foo bar baz}}` when called on `(foo, bar, baz)`.
// If `bar` and `baz` are functions, they are called before
// `foo` is called on them.
//
// This is the shared part of Spacebars.mustache and
// Spacebars.attrMustache, which differ in how they post-process the
// result.
Spacebars.mustacheImpl = function (value/*, args*/) {
  var args = arguments;
  // if we have any arguments (pos or kw), add an options argument
  // if there isn't one.
  if (args.length > 1) {
    var kw = args[args.length - 1];
    if (! (kw instanceof Spacebars.kw)) {
      kw = Spacebars.kw();
      // clone arguments into an actual array, then push
      // the empty kw object.
      args = Array.prototype.slice.call(arguments);
      args.push(kw);
    } else {
      // For each keyword arg, call it if it's a function
      var newHash = {};
      for (var k in kw.hash) {
        var v = kw.hash[k];
        newHash[k] = (typeof v === 'function' ? v() : v);
      }
      args[args.length - 1] = Spacebars.kw(newHash);
    }
  }

  return Deps.isolateValue(function () {
    return Spacebars.call.apply(null, args);
  });
};

Spacebars.mustache = function (value/*, args*/) {
  var result = Spacebars.mustacheImpl.apply(null, arguments);

  if (result instanceof Handlebars.SafeString)
    return HTML.Raw(result.toString());
  else
    // map `null` and `undefined` to "", stringify anything else
    // (e.g. strings, booleans, numbers including 0).
    return String(result == null ? '' : result);
};

Spacebars.attrMustache = function (value/*, args*/) {
  var result = Spacebars.mustacheImpl.apply(null, arguments);

  if (result == null || result === '') {
    return null;
  } else if (typeof result === 'object') {
    return result;
  } else if (typeof result === 'string' && HTML.isValidAttributeName(result)) {
    var obj = {};
    obj[result] = '';
    return obj;
  } else {
    throw new Error("Expected valid attribute name, '', null, or object");
  }
};

// Idempotently wrap in `HTML.Raw`.
//
// Called on the return value from `Spacebars.mustache` in case the
// template uses triple-stache (`{{{foo bar baz}}}`).
Spacebars.makeRaw = function (value) {
  if (value instanceof HTML.Raw)
    return value;
  else
    return HTML.Raw(value);
};

// If `value` is a function, called it on the `args`, after
// evaluating the args themselves (by calling them if they are
// functions).  Otherwise, simply return `value` (and assert that
// there are no args).
Spacebars.call = function (value/*, args*/) {
  if (typeof value === 'function') {
    // evaluate arguments if they are functions (by calling them)
    var newArgs = [];
    for (var i = 1; i < arguments.length; i++) {
      var arg = arguments[i];
      newArgs[i-1] = (typeof arg === 'function' ? arg() : arg);
    }

    return value.apply(null, newArgs);
  } else {
    if (arguments.length > 1)
      throw new Error("Can't call non-function: " + value);

    return value;
  }
};

// Call this as `Spacebars.kw({ ... })`.  The return value
// is `instanceof Spacebars.kw`.
Spacebars.kw = function (hash) {
  if (! (this instanceof Spacebars.kw))
    return new Spacebars.kw(hash);

  this.hash = hash || {};
};

// `Spacebars.dot(foo, "bar", "baz")` performs a special kind
// of `foo.bar.baz` that allows safe indexing of `null` and
// indexing of functions (which calls the function).  If the
// result is a function, it is always a bound function (e.g.
// a wrapped version of `baz` that always uses `foo.bar` as
// `this`).
//
// In `Spacebars.dot(foo, "bar")`, `foo` is assumed to be either
// a non-function value or a "fully-bound" function wrapping a value,
// where fully-bound means it takes no arguments and ignores `this`.
//
// `Spacebars.dot(foo, "bar")` performs the following steps:
//
// * If `foo` is falsy, return `foo`.
//
// * If `foo` is a function, call it (set `foo` to `foo()`).
//
// * If `foo` is falsy now, return `foo`.
//
// * Return `foo.bar`, binding it to `foo` if it's a function.
Spacebars.dot = function (value, id1/*, id2, ...*/) {
  if (arguments.length > 2) {
    // Note: doing this recursively is probably less efficient than
    // doing it in an iterative loop.
    var argsForRecurse = [];
    argsForRecurse.push(Spacebars.dot(value, id1));
    argsForRecurse.push.apply(argsForRecurse,
                              Array.prototype.slice.call(arguments, 2));
    return Spacebars.dot.apply(null, argsForRecurse);
  }

  if (typeof value === 'function')
    value = value();

  if (! value)
    return value; // falsy, don't index, pass through

  var result = value[id1];
  if (typeof result !== 'function')
    return result;
  // `value[id1]` (or `value()[id1]`) is a function.
  // Bind it so that when called, `value` will be placed in `this`.
  return function (/*arguments*/) {
    return result.apply(value, arguments);
  };
};
