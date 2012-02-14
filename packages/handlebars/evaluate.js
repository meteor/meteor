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
    // If Handlebars sees an &entity; in the input text, it won't quote
    // it (won't replace it with &ampentity;). I'm not sure if that's
    // the right choice -- it's definitely a heuristic..
    return x.replace(/&(?!\w+;)|[<>"'`]/g, escape_one);
  };
})();

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
      return helpers[id[1]];
    for (var i = 0; i < id[0]; i++) {
      if (!stack.parent)
        throw new Error("Too many '..' segments");
      else
        stack = stack.parent;
    }
    var ret = stack.data;
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

    _.each(elts, function (elt) {
      if (typeof(elt) === "string")
        buf.push(elt);
      else if (elt[0] === '{')
        buf.push(Handlebars._escape(toString(invoke(stack, elt[1]))));
      else if (elt[0] === '!')
        buf.push(toString(invoke(stack, elt[1] || '')));
      else if (elt[0] === '#') {
        var block = function (data) {
          return template({parent: stack, data: data}, elt[2]);
        };
        block.fn = block;
        block.inverse = function (data) {
          return template({parent: stack, data: data}, elt[3] || []);
        };
        buf.push(invoke(stack, elt[1], block));
      } else if (elt[0] === '>') {
        if (!(elt[1] in partials))
          throw new Error("No such partial '" + elt[1] + "'");
        buf.push(partials[elt[1]](stack.data));
      } else
        throw new Error("bad element in template");
    });

    return buf.join('');
  };

  return template({data: data, parent: null}, ast);
};

