"use strict";

var _getIterator = require("babel-runtime/core-js/get-iterator")["default"];

var _interopRequireWildcard = require("babel-runtime/helpers/interop-require-wildcard")["default"];

exports.__esModule = true;

var _babelTraverse = require("babel-traverse");

var _destructuring = require("./destructuring");

var destructuring = _interopRequireWildcard(_destructuring);

var _default = require("./default");

var def = _interopRequireWildcard(_default);

var _rest = require("./rest");

var rest = _interopRequireWildcard(_rest);

/*:: import type { NodePath } from "babel-traverse";*/
exports["default"] = function () {
  return {
    visitor: _babelTraverse.visitors.merge([{
      ArrowFunctionExpression: function ArrowFunctionExpression(path) {
        // default/rest visitors require access to `arguments`
        var params /*: Array<NodePath>*/ = path.get("params");
        for (var _iterator = params, _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _getIterator(_iterator);;) {
          var _ref;

          if (_isArray) {
            if (_i >= _iterator.length) break;
            _ref = _iterator[_i++];
          } else {
            _i = _iterator.next();
            if (_i.done) break;
            _ref = _i.value;
          }

          var param = _ref;

          if (param.isRestElement() || param.isAssignmentPattern()) {
            path.arrowFunctionToShadowed();
            break;
          }
        }
      }
    }, destructuring.visitor, rest.visitor, def.visitor])
  };
};

module.exports = exports["default"];