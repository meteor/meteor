"use strict";

var _interopRequireWildcard = require("babel-runtime/helpers/interop-require-wildcard")["default"];

exports.__esModule = true;

var _babelTypes = require("babel-types");

var t = _interopRequireWildcard(_babelTypes);

var visitor = {
  Function: function Function(path) {
    var params /*: Array*/ = path.get("params");

    // If there's a rest param, no need to loop through it. Also, we need to
    // hoist one more level to get `declar` at the right spot.
    var hoistTweak = t.isRestElement(params[params.length - 1]) ? 1 : 0;
    var outputParamsLength = params.length - hoistTweak;

    for (var i = 0; i < outputParamsLength; i++) {
      var param = params[i];
      if (param.isArrayPattern() || param.isObjectPattern()) {
        var uid = path.scope.generateUidIdentifier("ref");

        var declar = t.variableDeclaration("let", [t.variableDeclarator(param.node, uid)]);
        declar._blockHoist = outputParamsLength - i;

        path.ensureBlock();
        path.get("body").unshiftContainer("body", declar);

        param.replaceWith(uid);
      }
    }
  }
};
exports.visitor = visitor;