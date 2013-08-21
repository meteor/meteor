Handlebars = {};

// XXX we probably forgot to implement the #foo case where foo is not
// a helper (and similarly the ^foo case)

// XXX there is a ton of stuff that needs testing! like,
// everything. including the '..' stuff.

Handlebars.json_ast_to_func = function (ast) {
  return function (data, options) {
    return Handlebars.evaluate(ast, data, options);
  };
};

// If minimongo is available (it's a weak dependency) use its ID stringifier to
// label branches (so that, eg, ObjectId and strings don't overlap). Otherwise
// just use the identity function.
var idStringify = Package.minimongo
  ? Package.minimongo.LocalCollection._idStringify
  : function (id) { return id; };

// block helpers take:
// (N args), options (hash args, plus 'fn' and 'inverse')
// and return text
//
// normal helpers take:
// (N args), options (hash args)
//
// partials take one argument, data

// XXX handlebars' format for arguments is not the clearest, likely
// for backwards compatibility to mustache. eg, options ===
// options.fn. take the opportunity to clean this up. treat block
// arguments (fn, inverse) as just another kind of argument, same as
// what is passed in via named arguments.
Handlebars._default_helpers = {
  'with': function (data, options) {
    if (!data || (data instanceof Array && !data.length))
      return options.inverse(this);
    else
      return options.fn(data);
  },
  'each': function (data, options) {
    var parentData = this;
    if (data && data.length > 0)
      return _.map(data, function(x, i) {
        // infer a branch key from the data
        var branch = ((x && x._id && idStringify(x._id)) ||
                      (typeof x === 'string' ? x : null) ||
                      Spark.UNIQUE_LABEL);
        return Spark.labelBranch(branch, function() {
          return options.fn(x);
        });
      }).join('');
    else
      return Spark.labelBranch(
        'else',
        function () {
          return options.inverse(parentData);
        });
  },
  'if': function (data, options) {
    if (!data || (data instanceof Array && !data.length))
      return options.inverse(this);
    else
      return options.fn(this);
  },
  'unless': function (data, options) {
    if (!data || (data instanceof Array && !data.length))
      return options.fn(this);
    else
      return options.inverse(this);
  }
};

Handlebars.registerHelper = function (name, func) {
  if (name in Handlebars._default_helpers)
    throw new Error("There is already a helper '" + name + "'");
  Handlebars._default_helpers[name] = func;
};

// Utility to HTML-escape a string.
Handlebars._escape = (function() {
  var escape_map = {
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "`": "&#x60;", /* IE allows backtick-delimited attributes?? */
    "&": "&amp;"
  };
  var escape_one = function(c) {
    return escape_map[c];
  };

  return function (x) {
    return x.replace(/[&<>"'`]/g, escape_one);
  };
})();

// be able to recognize default "this", which is different in different environments
Handlebars._defaultThis = (function() { return this; })();

Handlebars.evaluate = function (ast, data, options) {
  options = options || {};
  var helpers = _.extend({}, Handlebars._default_helpers);
  _.extend(helpers, options.helpers || {});
  var partials = options.partials || {};

  // re 'stack' arguments: top of stack is the current data to use for
  // the template. higher levels are the data referenced by
  // identifiers with one or more '..' segments. we have to keep the
  // stack pure-functional style, with a tree rather than an array,
  // because we want to continue to allow block helpers provided by
  // the user to capture their subtemplate rendering functions and
  // call them later, after we've finished running (for eg findLive.)
  // maybe revisit later.

  var eval_value = function (stack, id) {
    if (typeof(id) !== "object")
      return id;

    // follow '..' in {{../../foo.bar}}
    for (var i = 0; i < id[0]; i++) {
      if (!stack.parent)
        throw new Error("Too many '..' segments");
      else
        stack = stack.parent;
    }

    if (id.length === 1)
      // no name: {{this}}, {{..}}, {{../..}}
      return stack.data;

    var scopedToContext = false;
    if (id[1] === '') {
      // an empty path segment is our AST's way of encoding
      // the presence of 'this.' at the beginning of the path.
      id = id.slice();
      id.splice(1, 1); // remove the ''
      scopedToContext = true;
    }

    // when calling functions (helpers/methods/getters), dataThis
    // tracks what to use for `this`.  For helpers, it's the
    // current data context.  For getters and methods on the data
    // context object, and on the return value of a helper, it's
    // the object where we got the getter or method.
    var dataThis = stack.data;

    var data;
    if (id[0] === 0 && helpers.hasOwnProperty(id[1]) && ! scopedToContext) {
      // first path segment is a helper
      data = helpers[id[1]];
    } else {
      if ((! data instanceof Object) &&
          (typeof (function() {})[id[1]] !== 'undefined') &&
          ! scopedToContext) {
        // Give a helpful error message if the user tried to name
        // a helper 'name', 'length', or some other built-in property
        // of function objects.  Unfortunately, this case is very
        // hard to detect, as Template.foo.name = ... will fail silently,
        // and {{name}} will be silently empty if the property doesn't
        // exist (per Handlebars rules).
        // However, if there is no data context at all, we jump in.
        throw new Error("Can't call a helper '"+id[1]+"' because "+
                        "it is a built-in function property in JavaScript");
      }
      // first path segment is property of data context
      data = (stack.data && stack.data[id[1]]);
    }

    // handle dots, as in {{foo.bar}}
    for (var i = 2; i < id.length; i++) {
      // Call functions when taking the dot, to support
      // for example currentUser.name.
      //
      // In the case of {{foo.bar}}, we end up returning one of:
      // - helpers.foo.bar
      // - helpers.foo().bar
      // - stack.data.foo.bar
      // - stack.data.foo().bar.
      //
      // The caller does the final application with any
      // arguments, as in {{foo.bar arg1 arg2}}, and passes
      // the current data context in `this`.  Therefore,
      // we use the current data context (`helperThis`)
      // for all function calls.
      if (typeof data === 'function') {
        data = data.call(dataThis);
        dataThis = data;
      }
      if (data === undefined || data === null) {
        // Handlebars fails silently and returns "" if
        // we start to access properties that don't exist.
        data = '';
        break;
      }

      data = data[id[i]];
    }

    // ensure `this` is bound appropriately when the caller
    // invokes `data` with any arguments.  For example,
    // in {{foo.bar baz}}, the caller must supply `baz`,
    // but we alone have `foo` (in `dataThis`).
    if (typeof data === 'function')
      return _.bind(data, dataThis);

    return data;
  };

  // 'extra' will be clobbered, but not 'params'.
  // if (isNested), evaluate params.slice(1) as a nested
  // helper invocation if there is at least one positional
  // argument.  This is used for block helpers.
  var invoke = function (stack, params, extra, isNested) {
    extra = extra || {};
    params = params.slice(0);

    // remove hash (dictionary of keyword arguments) from
    // the end of params, if present.
    var last = params[params.length - 1];
    var hash = {};
    if (typeof(last) === "object" && !(last instanceof Array)) {
      // evaluate hash values, which are found as invocations
      // like [0, "foo"]
      _.each(params.pop(), function(v,k) {
        var result = eval_value(stack, v);
        hash[k] = (typeof result === "function" ? result() : result);
      });
    }

    var apply = function (values, extra) {
      var args = values.slice(1);
      for(var i=0; i<args.length; i++)
        if (typeof args[i] === "function")
          args[i] = args[i](); // `this` already bound by eval_value
      if (extra)
        args.push(extra);
      return values[0].apply(stack.data, args);
    };

    var values = new Array(params.length);
    for(var i=0; i<params.length; i++)
      values[i] = eval_value(stack, params[i]);

    if (typeof(values[0]) !== "function")
      return values[0];

    if (isNested && values.length > 1) {
      // at least one positional argument; not no args
      // or only hash args.
      var oneArg = values[1];
      if (typeof oneArg === "function")
        // invoke the positional arguments
        // (and hash arguments) as a nested helper invocation.
        oneArg = apply(values.slice(1), {hash:hash});
      values = [values[0], oneArg];
      // keyword args don't go to the block helper, then.
      extra.hash = {};
    } else {
      extra.hash = hash;
    }

    return apply(values, extra);
  };

  var template = function (stack, elts, basePCKey) {
    var buf = [];

    var toString = function (x) {
      if (typeof x === "string") return x;
      // May want to revisit the following one day
      if (x === null) return "null";
      if (x === undefined) return "";
      return x.toString();
    };

    // wrap `fn` and `inverse` blocks in chunks having `data`, if the data
    // is different from the enclosing data, so that the data is available
    // at runtime for events.
    var decorateBlockFn = function(fn, old_data) {
      return function(data) {
        // don't create spurious annotations when data is same
        // as before (or when transitioning between e.g. `window` and
        // `undefined`)
        if ((data || Handlebars._defaultThis) ===
            (old_data || Handlebars._defaultThis))
          return fn(data);
        else
          return Spark.setDataContext(data, fn(data));
      };
    };

    // Handle the return value of a {{helper}}.
    // Takes a:
    //   string - escapes it
    //   SafeString - returns the underlying string unescaped
    //   other value - coerces to a string and escapes it
    var maybeEscape = function(x) {
      if (x instanceof Handlebars.SafeString)
        return x.toString();
      return Handlebars._escape(toString(x));
    };

    var curIndex;
    // Construct a unique key for the current position
    // in the AST.  Since template(...) is invoked recursively,
    // the "PC" (program counter) key is hierarchical, consisting
    // of one or more numbers, for example '0' or '1.3.0.1'.
    var getPCKey = function() {
      return (basePCKey ? basePCKey+'.' : '') + curIndex;
    };
    var branch = function(name, func) {
      // Construct a unique branch identifier based on what partial
      // we're in, what partial or helper we're calling, and our index
      // into the template AST (essentially the program counter).
      // If "foo" calls "bar" at index 3, it looks like: bar@foo#3.
      return Spark.labelBranch(name + "@" + getPCKey(), func);
    };

    _.each(elts, function (elt, index) {
      curIndex = index;
      if (typeof(elt) === "string")
        buf.push(elt);
      else if (elt[0] === '{')
        // {{double stache}}
        buf.push(branch(elt[1], function () {
          return maybeEscape(invoke(stack, elt[1]));
        }));
      else if (elt[0] === '!')
        // {{{triple stache}}}
        buf.push(branch(elt[1], function () {
          return toString(invoke(stack, elt[1] || ''));
        }));
      else if (elt[0] === '#') {
        // {{#block helper}}
        var pcKey = getPCKey();
        var block = decorateBlockFn(
          function (data) {
            return template({parent: stack, data: data}, elt[2], pcKey);
          }, stack.data);
        block.fn = block;
        block.inverse = decorateBlockFn(
          function (data) {
            return template({parent: stack, data: data}, elt[3] || [], pcKey);
          }, stack.data);
        var html = branch(elt[1], function () {
          return toString(invoke(stack, elt[1], block, true));
        });
        buf.push(html);
      } else if (elt[0] === '>') {
        // {{> partial}}
        var partialName = elt[1];
        if (!(partialName in partials))
          // XXX why do we call these templates in docs and partials in code?
          throw new Error("No such template '" + partialName + "'");
        // call the partial
        var html = branch(partialName, function () {
          return toString(partials[partialName](stack.data));
        });
        buf.push(html);
      } else
        throw new Error("bad element in template");
    });

    return buf.join('');
  };

  // Set the prefix for PC keys, which identify call sites in the AST
  // for the purpose of chunk matching.
  // `options.name` will be null in the body, but otherwise have a value,
  // assuming `options` was assembled in templating/deftemplate.js.
  var rootPCKey = (options.name||"")+"#";

  return template({data: data, parent: null}, ast, rootPCKey);
};

Handlebars.SafeString = function(string) {
  this.string = string;
};
Handlebars.SafeString.prototype.toString = function() {
  return this.string.toString();
};
