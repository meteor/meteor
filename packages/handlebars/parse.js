Handlebars = {};

/* Our format:
 *
 * A 'template' is an array. Each element in it is either
 * - a literal string to echo
 * - an escaped substition: ['{', invocation]
 * - an unescaped substition: ['!', invocation]
 * - a (conditional or iterated) block:
 *   ['#', invocation, template_a, template_b]
 *   (the second template is optional)
 * - a partial: ['>', partial_name] (partial_name is a string)
 *
 * An 'invocation' is an array: one or more 'values', then an optional
 * hash (of which the keys are strings, and the values are 'values'.)
 *
 * An 'identifier' is:
 * - [depth, key, key, key..]
 * Eg, '../../a.b.c' would be [2, 'a', 'b', 'c']. 'a' would be [0, 'a'].
 * And 'this' or '.' would be [0].
 *
 * A 'value' is either an identifier, or a string, int, or bool.
 *
 * You should provide a block helper 'with' since we will emit calls
 * to it (if the user passes the second 'context' argument to a
 * partial.)
 */


Handlebars.to_json_ast = function (code) {
  // We need handlebars and underscore, but this is bundle time, so
  // we load them using 'require'.
  // If we're in a unit test right now, we're actually in the server
  // run-time environment; we have '_' but not 'require'.
  // This is all very hacky.
  var req = (typeof require === 'undefined' ?
             __meteor_bootstrap__.require : require);
  var path = req('path');

  var _ = global._;
  if (! _)
    _ = req(path.join('..', '..', 'packages', 'underscore', 'underscore.js')); // XXX super lame

  var ast = req("handlebars").parse(code);

  // Recreate Handlebars.Exception to properly report error messages
  // and stack traces. (https://github.com/wycats/handlebars.js/issues/226)
  makeHandlebarsExceptionsVisible(req);

  var identifier = function (node) {
    if (node.type !== "ID")
      throw new Error("got ast node " + node.type + " for identifier");
    // drop node.isScoped. this is true if there was a 'this' or '.'
    // anywhere in the path. vanilla handlebars will turn off
    // helpers lookup if isScoped is true, but this is too restrictive
    // for us.
    var ret = [node.depth];
    // we still want to turn off helper lookup if path starts with 'this.'
    // as in {{this.foo}}, which means it has to look different from {{foo}}
    // in our AST.  signal the presence of 'this' in our AST using an empty
    // path segment.
    if (/^this\./.test(node.original))
      ret.push('');
    return ret.concat(node.parts);
  };

  var value = function (node) {
    var choices = {
      ID: function (node) {return identifier(node);},
      STRING: function (node) {return node.string;},
      INTEGER: function (node) {return node.integer;},
      BOOLEAN: function (node) {return node.bool;},
    };
    if (!(node.type in choices))
      throw new Error("got ast node " + node.type + " for value");
    return choices[node.type](node);
  };

  var hash = function (node) {
    if (node.type !== "hash")
      throw new Error("got ast node " + node.type + " for hash");
    var ret = {};
    _.each(node.pairs, function (p) {
      ret[p[0]] = value(p[1]);
    });
    return ret;
  };

  var invocation = function (node) {
    if (node.type !== "mustache")
      throw new Error("got ast node " + node.type + " for invocation");
    var ret = [node.id];
    ret = ret.concat(node.params);
    ret = _.map(ret, value);
    if (node.hash)
      ret.push(hash(node.hash));
    return ret;
  };

  var template = function (nodes) {
    var ret = [];

    if (!nodes)
      return [];

    var choices = {
      mustache: function (node) {
        ret.push([node.escaped ? '{' : '!', invocation(node)]);
      },
      partial: function (node) {
        var id = identifier(node.id);
        if (id.length !== 2 || id[0] !== 0)
          // XXX actually should just get the literal string the
          // entered, and avoid identifier parsing
          throw new Error("Template names shouldn't contain '.' or '/'");
        var x = ['>', id[1]];
        if (node.context)
          x = ['#', [[0, 'with'], identifier(node.context)], [x]];
        ret.push(x);
      },
      block: function (node) {
        var x = ['#', invocation(node.mustache),
                 template(node.program.statements)];
        if (node.program.inverse)
          x.push(template(node.program.inverse.statements));
        ret.push(x);
      },
      inverse: function (node) {
        ret.push(['#', invocation(node.mustache),
                  node.program.inverse &&
                  template(node.program.inverse.statements) || [],
                  template(node.program.statements)]);
      },
      content: function (node) {ret.push(node.string);},
      comment: function (node) {}
    };

    _.each(nodes, function (node) {
      if (!(node.type in choices))
        throw new Error("got ast node " + node.type + " in template");
      choices[node.type](node);
    });

    return ret;
  };

  if (ast.type !== "program")
    throw new Error("got ast node " + node.type + " at toplevel");
  return template(ast.statements);
};

var makeHandlebarsExceptionsVisible = function (req) {
  req("handlebars").Exception = function(message) {
    this.message = message;
    // In Node, if we don't do this we don't see the message displayed
    // nor the right stack trace.
    Error.captureStackTrace(this, arguments.callee);
  };
  req("handlebars").Exception.prototype = new Error();
  req("handlebars").Exception.prototype.name = 'Handlebars.Exception';
};
