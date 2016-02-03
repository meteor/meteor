"use strict";

var _getIterator = require("babel-runtime/core-js/get-iterator")["default"];

var _interopRequireDefault = require("babel-runtime/helpers/interop-require-default")["default"];

var _interopRequireWildcard = require("babel-runtime/helpers/interop-require-wildcard")["default"];

exports.__esModule = true;

var _babelTemplate = require("babel-template");

var _babelTemplate2 = _interopRequireDefault(_babelTemplate);

var _babelTypes = require("babel-types");

var t = _interopRequireWildcard(_babelTypes);

var buildRest = _babelTemplate2["default"]("\n  for (var LEN = ARGUMENTS.length,\n           ARRAY = Array(ARRAY_LEN),\n           KEY = START;\n       KEY < LEN;\n       KEY++) {\n    ARRAY[ARRAY_KEY] = ARGUMENTS[KEY];\n  }\n");

var loadRest = _babelTemplate2["default"]("\n  ARGUMENTS.length <= INDEX ? undefined : ARGUMENTS[INDEX]\n");

var memberExpressionOptimisationVisitor = {
  Scope: function Scope(path, state) {
    // check if this scope has a local binding that will shadow the rest parameter
    if (!path.scope.bindingIdentifierEquals(state.name, state.outerBinding)) {
      path.skip();
    }
  },

  Flow: function Flow(path) {
    // don't touch reference in type annotations
    path.skip();
  },

  Function: function Function(path, state) {
    // Detect whether any reference to rest is contained in nested functions to
    // determine if deopt is necessary.
    var oldNoOptimise = state.noOptimise;
    state.noOptimise = true;
    path.traverse(memberExpressionOptimisationVisitor, state);
    state.noOptimise = oldNoOptimise;

    // Skip because optimizing references to rest would refer to the `arguments`
    // of the nested function.
    path.skip();
  },

  ReferencedIdentifier: function ReferencedIdentifier(path, state) {
    var node = path.node;

    // we can't guarantee the purity of arguments
    if (node.name === "arguments") {
      state.deopted = true;
    }

    // is this a referenced identifier and is it referencing the rest parameter?
    if (node.name !== state.name) return;

    if (state.noOptimise) {
      state.deopted = true;
    } else {
      var parentPath = path.parentPath;

      // ex: args[0]
      if (parentPath.isMemberExpression({ computed: true, object: node })) {
        // if we know that this member expression is referencing a number then
        // we can safely optimise it
        var prop = parentPath.get("property");
        if (prop.isBaseType("number")) {
          state.candidates.push({ cause: "indexGetter", path: path });
          return;
        }
      }

      // ex: args.length
      if (parentPath.isMemberExpression({ computed: false, object: node })) {
        var prop = parentPath.get("property");
        if (prop.node.name === "length") {
          state.candidates.push({ cause: "lengthGetter", path: path });
          return;
        }
      }

      // we can only do these optimizations if the rest variable would match
      // the arguments exactly
      // optimise single spread args in calls
      // ex: fn(...args)
      if (state.offset === 0 && parentPath.isSpreadElement()) {
        var call = parentPath.parentPath;
        if (call.isCallExpression() && call.node.arguments.length === 1) {
          state.candidates.push({ cause: "argSpread", path: path });
          return;
        }
      }

      state.references.push(path);
    }
  },

  /**
   * Deopt on use of a binding identifier with the same name as our rest param.
   *
   * See https://github.com/babel/babel/issues/2091
   */

  BindingIdentifier: function BindingIdentifier(_ref2, state) {
    var node = _ref2.node;

    if (node.name === state.name) {
      state.deopted = true;
    }
  }
};
function hasRest(node) {
  return t.isRestElement(node.params[node.params.length - 1]);
}

function optimiseIndexGetter(path, argsId, offset) {
  var index = undefined;

  if (t.isNumericLiteral(path.parent.property)) {
    index = t.numericLiteral(path.parent.property.value + offset);
  } else {
    index = t.binaryExpression("+", path.parent.property, t.numericLiteral(offset));
  }

  path.parentPath.replaceWith(loadRest({
    ARGUMENTS: argsId,
    INDEX: index
  }));
}

function optimiseLengthGetter(path, argsLengthExpression, argsId, offset) {
  if (offset) {
    path.parentPath.replaceWith(t.binaryExpression("-", argsLengthExpression, t.numericLiteral(offset)));
  } else {
    path.replaceWith(argsId);
  }
}

var visitor = {
  Function: function Function(path) {
    var node = path.node;
    var scope = path.scope;

    if (!hasRest(node)) return;

    var rest = node.params.pop().argument;

    var argsId = t.identifier("arguments");
    var argsLengthExpression = t.memberExpression(argsId, t.identifier("length"));

    // otherwise `arguments` will be remapped in arrow functions
    argsId._shadowedFunctionLiteral = path;

    // check and optimise for extremely common cases
    var state = {
      references: [],
      offset: node.params.length,

      argumentsNode: argsId,
      outerBinding: scope.getBindingIdentifier(rest.name),

      // candidate member expressions we could optimise if there are no other references
      candidates: [],

      // local rest binding name
      name: rest.name,

      /*
      It may be possible to optimize the output code in certain ways, such as
      not generating code to initialize an array (perhaps substituting direct
      references to arguments[i] or arguments.length for reads of the
      corresponding rest parameter property) or positioning the initialization
      code so that it may not have to execute depending on runtime conditions.
       This property tracks eligibility for optimization. "deopted" means give up
      and don't perform optimization. For example, when any of rest's elements /
      properties is assigned to at the top level, or referenced at all in a
      nested function.
      */
      noOptimise: true,
      deopted: true
    };

    path.traverse(memberExpressionOptimisationVisitor, state);

    // There are only "shorthand" references
    if (!state.deopted && !state.references.length) {
      for (var _iterator = (state.candidates /*: Array*/), _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _getIterator(_iterator);;) {
        var _ref;

        if (_isArray) {
          if (_i >= _iterator.length) break;
          _ref = _iterator[_i++];
        } else {
          _i = _iterator.next();
          if (_i.done) break;
          _ref = _i.value;
        }

        var _path = _ref.path;
        var cause = _ref.cause;

        switch (cause) {
          case "indexGetter":
            optimiseIndexGetter(_path, argsId, state.offset);
            break;
          case "lengthGetter":
            optimiseLengthGetter(_path, argsLengthExpression, argsId, state.offset);
            break;
          default:
            _path.replaceWith(argsId);
        }
      }
      return;
    }

    state.references = state.references.concat(state.candidates.map(function (_ref3) {
      var path = _ref3.path;
      return path;
    }));

    // deopt shadowed functions as transforms like regenerator may try touch the allocation loop
    state.deopted = state.deopted || !!node.shadow;

    var start = t.numericLiteral(node.params.length);
    var key = scope.generateUidIdentifier("key");
    var len = scope.generateUidIdentifier("len");

    var arrKey = key;
    var arrLen = len;
    if (node.params.length) {
      // this method has additional params, so we need to subtract
      // the index of the current argument position from the
      // position in the array that we want to populate
      arrKey = t.binaryExpression("-", key, start);

      // we need to work out the size of the array that we're
      // going to store all the rest parameters
      //
      // we need to add a check to avoid constructing the array
      // with <0 if there are less arguments than params as it'll
      // cause an error
      arrLen = t.conditionalExpression(t.binaryExpression(">", len, start), t.binaryExpression("-", len, start), t.numericLiteral(0));
    }

    var loop = buildRest({
      ARGUMENTS: argsId,
      ARRAY_KEY: arrKey,
      ARRAY_LEN: arrLen,
      START: start,
      ARRAY: rest,
      KEY: key,
      LEN: len
    });

    if (state.deopted) {
      loop._blockHoist = node.params.length + 1;
      node.body.body.unshift(loop);
    } else {
      // perform allocation at the lowest common ancestor of all references
      loop._blockHoist = 1;

      var target = path.getEarliestCommonAncestorFrom(state.references).getStatementParent();

      // don't perform the allocation inside a loop
      target.findParent(function (path) {
        if (path.isLoop()) {
          target = path;
        } else {
          // Stop crawling up if this is a function.
          return path.isFunction();
        }
      });

      target.insertBefore(loop);
    }
  }
};
exports.visitor = visitor;