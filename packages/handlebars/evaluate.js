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

// block helpers take:
// (N args), options (hash args, plus 'fn' and 'inverse')
// and return text
//
// normal helpers take:
// (N args), options (hash args)
//
// partials take one argument, data

// XXX handlebars' format for arguments is stupid. eg, options ===
// options.fn. plow this stuff under. treat block arguments (fn,
// inverse) as just another kind of argument, same as what is passed
// in via named arguments.
Handlebars._default_helpers = {
  'with': function (data, options) {
    return options.fn(data);
  },
  'each': function (data, options) {
    if (data && data.length > 0)
      return _.map(data, options.fn).join('');
    else
      return options.inverse(this);
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
    if (id.length === 2 && id[0] === 0 && (id[1] in helpers))
      return helpers[id[1]]; // found helper
    for (var i = 0; i < id[0]; i++) {
      if (!stack.parent)
        throw new Error("Too many '..' segments");
      else
        stack = stack.parent;
    }
    var ret = stack.data;
    if (id.length > 1 && typeof ret !== 'object') {
      // Fail with better error than "can't read property of undefined".
      // Looking up id[1] as a property will fail, because
      // there is no data context object.  Probably the developer
      // intended to use a helper that doesn't exist.
      if (typeof (function() {})[id[1]] !== 'undefined') {
        // An even more specific case for a helpful error.
        // The developer probably tried to name a helper 'name',
        // 'length', or some other built-in function property.
        // Assignments to these properties are no-ops, so the
        // helper declaration is undetectable.
        // We can't always catch this mistake, because if there is any
        // object as data context, it's legal for the developer to
        // ask for {{name}} as a property of the object, perhaps an
        // optional one.  But if there is no data context, we get
        // to be helpful.
        throw new Error("Can't call a helper '"+id[1]+"' because "+
                        "it is a built-in function property in JavaScript");
      }
      throw new Error("Unknown helper '"+id[1]+"'");
    }
    for (var i = 1; i < id.length; i++)
      // XXX error (and/or unknown key) handling
      ret = ret[id[i]];
    return ret;
  };

  // 'extra' will be clobbered, but not 'params'
  var invoke = function (stack, params, extra) {
    extra = extra || {};
    params = params.slice(0);
    var last = params.pop();
    if (typeof(last) === "object" && !(last instanceof Array))
      extra.hash = last;
    else
      params.push(last);

    // values[0] must be a function. if values[1] is a function, then
    // apply values[1] to the remaining arguments, then apply
    // values[0] to the results. otherwise, directly apply values[0]
    // to the other arguments. if toplevel, also pass 'extra' as an
    // argument.
    var apply = function (values, toplevel) {
      var args = values.slice(1);
      if (args.length && typeof (args[0]) === "function")
        args = [apply(args)];
      if (toplevel)
        args.push(extra);
      return values[0].apply(stack.data, args);
    };

    var values = new Array(params.length);
    for(var i=0; i<params.length; i++)
      values[i] = eval_value(stack, params[i]);

    if (typeof(values[0]) !== "function")
      return values[0];
    return apply(values, true);
  };

  var template = function (stack, elts) {
    var buf = [];

    var toString = function (x) {
      if (typeof x === "string") return x;
      // May want to revisit the following one day
      if (x === null) return "null";
      if (x === undefined) return "";
      return x.toString();
    };

    // wrap `fn` and `inverse` blocks in liveranges
    // having event_data, if the data is different
    // from the enclosing data.
    var decorateBlockFn = function(fn, old_data) {
      return function(data) {
        var result = fn(data);
        // don't create spurious ranges when data is same as before
        // (or when transitioning between e.g. `window` and `undefined`)
        if ((data || Handlebars._defaultThis) ===
            (old_data || Handlebars._defaultThis)) {
          return result;
        } else {
          return Meteor.ui.chunk(
            function() { return result; },
            { event_data: data });
        }
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

    _.each(elts, function (elt) {
      if (typeof(elt) === "string")
        buf.push(elt);
      else if (elt[0] === '{')
        buf.push(maybeEscape(invoke(stack, elt[1])));
      else if (elt[0] === '!')
        buf.push(toString(invoke(stack, elt[1] || '')));
      else if (elt[0] === '#') {
        var block = decorateBlockFn(
          function (data) {
            return template({parent: stack, data: data}, elt[2]);
          }, stack.data);
        block.fn = block;
        block.inverse = decorateBlockFn(
          function (data) {
            return template({parent: stack, data: data}, elt[3] || []);
          }, stack.data);
        buf.push(toString(invoke(stack, elt[1], block)));
      } else if (elt[0] === '>') {
        if (!(elt[1] in partials))
          throw new Error("No such partial '" + elt[1] + "'");
        buf.push(toString(partials[elt[1]](stack.data)));
      } else
        throw new Error("bad element in template");
    });

    return buf.join('');
  };

  return template({data: data, parent: null}, ast);
};

Handlebars.SafeString = function(string) {
  this.string = string;
};
Handlebars.SafeString.prototype.toString = function() {
  return this.string.toString();
};
