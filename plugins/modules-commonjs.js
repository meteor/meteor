"use strict";

var _Symbol = require("babel-runtime/core-js/symbol")["default"];

var _getIterator = require("babel-runtime/core-js/get-iterator")["default"];

var _Object$create = require("babel-runtime/core-js/object/create")["default"];

var _Object$keys = require("babel-runtime/core-js/object/keys")["default"];

var _interopRequireDefault = require("babel-runtime/helpers/interop-require-default")["default"];

var _interopRequireWildcard = require("babel-runtime/helpers/interop-require-wildcard")["default"];

exports.__esModule = true;

var _path2 = require("path");

var _babelTemplate = require("babel-template");

var _babelTemplate2 = _interopRequireDefault(_babelTemplate);

var _babelTypes = require("babel-types");

var t = _interopRequireWildcard(_babelTypes);

var buildRequire = _babelTemplate2["default"]("\n  require($0);\n");

var buildExportsModuleDeclaration = _babelTemplate2["default"]("\n  Object.defineProperty(exports, \"__esModule\", {\n    value: true\n  });\n");

var buildExportsFrom = _babelTemplate2["default"]("\n  Object.defineProperty(exports, $0, {\n    enumerable: true,\n    get: function () {\n      return $1;\n    }\n  });\n");

var buildLooseExportsModuleDeclaration = _babelTemplate2["default"]("\n  exports.__esModule = true;\n");

var buildExportsAssignment = _babelTemplate2["default"]("\n  exports.$0 = $1;\n");

var buildExportAll = _babelTemplate2["default"]("\n  for (let KEY in OBJECT) {\n    if (KEY === \"default\") continue;\n\n    Object.defineProperty(exports, KEY, {\n      enumerable: true,\n      get: function () {\n        return OBJECT[KEY];\n      }\n    });\n  }\n");

var THIS_BREAK_KEYS = ["FunctionExpression", "FunctionDeclaration", "ClassProperty", "ClassMethod", "ObjectMethod"];

exports["default"] = function () {
  var REASSIGN_REMAP_SKIP = _Symbol();

  var reassignmentVisitor = {
    ReferencedIdentifier: function ReferencedIdentifier(path) {
      var name = path.node.name;
      var remap = this.remaps[name];
      if (!remap) return;

      // redeclared in this scope
      if (this.scope.getBinding(name) !== path.scope.getBinding(name)) return;

      if (path.parentPath.isCallExpression({ callee: path.node })) {
        path.replaceWith(t.sequenceExpression([t.numericLiteral(0), remap]));
      } else {
        path.replaceWith(remap);
      }
    },

    AssignmentExpression: function AssignmentExpression(path) {
      var node = path.node;
      if (node[REASSIGN_REMAP_SKIP]) return;

      var left = path.get("left");
      if (!left.isIdentifier()) return;

      var name = left.node.name;
      var exports = this.exports[name];
      if (!exports) return;

      // redeclared in this scope
      if (this.scope.getBinding(name) !== path.scope.getBinding(name)) return;

      node[REASSIGN_REMAP_SKIP] = true;

      for (var _iterator = exports, _isArray = Array.isArray(_iterator), _i = 0, _iterator = _isArray ? _iterator : _getIterator(_iterator);;) {
        var _ref;

        if (_isArray) {
          if (_i >= _iterator.length) break;
          _ref = _iterator[_i++];
        } else {
          _i = _iterator.next();
          if (_i.done) break;
          _ref = _i.value;
        }

        var reid = _ref;

        node = buildExportsAssignment(reid, node).expression;
      }

      path.replaceWith(node);
    },

    UpdateExpression: function UpdateExpression(path) {
      var arg = path.get("argument");
      if (!arg.isIdentifier()) return;

      var name = arg.node.name;
      var exports = this.exports[name];
      if (!exports) return;

      // redeclared in this scope
      if (this.scope.getBinding(name) !== path.scope.getBinding(name)) return;

      var node = t.assignmentExpression(path.node.operator[0] + "=", arg.node, t.numericLiteral(1));

      if (path.parentPath.isExpressionStatement() && !path.isCompletionRecord() || path.node.prefix) {
        return path.replaceWith(node);
      }

      var nodes = [];
      nodes.push(node);

      var operator = undefined;
      if (path.node.operator === "--") {
        operator = "+";
      } else {
        // "++"
        operator = "-";
      }
      nodes.push(t.binaryExpression(operator, arg.node, t.numericLiteral(1)));

      path.replaceWithMultiple(t.sequenceExpression(nodes));
    }
  };

  return {
    inherits: require("babel-plugin-transform-strict-mode"),

    visitor: {
      ThisExpression: function ThisExpression(path, state) {
        if (state.opts.allowTopLevelThis !== true && !path.findParent(function (path) {
          return !path.is("shadow") && THIS_BREAK_KEYS.indexOf(path.type) >= 0;
        })) {
          path.replaceWith(t.identifier("undefined"));
        }
      },

      Program: {
        exit: function exit(path) {
          var strict = !!this.opts.strict;

          var scope = path.scope;

          // rename these commonjs variables if they're declared in the file
          scope.rename("module");
          scope.rename("exports");
          scope.rename("require");

          var hasExports = false;
          var hasImports = false;

          var body /*: Array<Object>*/ = path.get("body");
          var imports = _Object$create(null);
          var exports = _Object$create(null);

          var nonHoistedExportNames = _Object$create(null);

          var topNodes = [];
          var remaps = _Object$create(null);

          var requires = _Object$create(null);

          function addRequire(source, blockHoist) {
            var cached = requires[source];
            if (cached) return cached;

            var ref = path.scope.generateUidIdentifier(_path2.basename(source, _path2.extname(source)));

            var varDecl = t.variableDeclaration("var", [t.variableDeclarator(ref, buildRequire(t.stringLiteral(source)).expression)]);

            if (typeof blockHoist === "number" && blockHoist > 0) {
              varDecl._blockHoist = blockHoist;
            }

            topNodes.push(varDecl);

            return requires[source] = ref;
          }

          function addTo(obj, key, arr) {
            var existing = obj[key] || [];
            obj[key] = existing.concat(arr);
          }

          for (var _iterator2 = body, _isArray2 = Array.isArray(_iterator2), _i2 = 0, _iterator2 = _isArray2 ? _iterator2 : _getIterator(_iterator2);;) {
            var _ref2;

            if (_isArray2) {
              if (_i2 >= _iterator2.length) break;
              _ref2 = _iterator2[_i2++];
            } else {
              _i2 = _iterator2.next();
              if (_i2.done) break;
              _ref2 = _i2.value;
            }

            var _path = _ref2;

            if (_path.isExportDeclaration()) {
              hasExports = true;

              var specifiers = [].concat(_path.get("declaration"), _path.get("specifiers"));
              for (var _iterator3 = specifiers, _isArray3 = Array.isArray(_iterator3), _i3 = 0, _iterator3 = _isArray3 ? _iterator3 : _getIterator(_iterator3);;) {
                var _ref3;

                if (_isArray3) {
                  if (_i3 >= _iterator3.length) break;
                  _ref3 = _iterator3[_i3++];
                } else {
                  _i3 = _iterator3.next();
                  if (_i3.done) break;
                  _ref3 = _i3.value;
                }

                var specifier = _ref3;

                var ids = specifier.getBindingIdentifiers();
                if (ids.__esModule) {
                  throw specifier.buildCodeFrameError("Illegal export \"__esModule\"");
                }
              }
            }

            if (_path.isImportDeclaration()) {
              // istanbul ignore next

              var _importsEntry$specifiers;

              hasImports = true;

              var key = _path.node.source.value;
              var importsEntry = imports[key] || {
                specifiers: [],
                maxBlockHoist: 0
              };

              (_importsEntry$specifiers = importsEntry.specifiers).push.apply(_importsEntry$specifiers, _path.node.specifiers);

              if (typeof _path.node._blockHoist === "number") {
                importsEntry.maxBlockHoist = Math.max(_path.node._blockHoist, importsEntry.maxBlockHoist);
              }

              imports[key] = importsEntry;

              _path.remove();
            } else if (_path.isExportDefaultDeclaration()) {
              var declaration = _path.get("declaration");
              if (declaration.isFunctionDeclaration()) {
                var id = declaration.node.id;
                var defNode = t.identifier("default");
                if (id) {
                  addTo(exports, id.name, defNode);
                  topNodes.push(buildExportsAssignment(defNode, id));
                  _path.replaceWith(declaration.node);
                } else {
                  topNodes.push(buildExportsAssignment(defNode, t.toExpression(declaration.node)));
                  _path.remove();
                }
              } else if (declaration.isClassDeclaration()) {
                var id = declaration.node.id;
                var defNode = t.identifier("default");
                if (id) {
                  addTo(exports, id.name, defNode);
                  _path.replaceWithMultiple([declaration.node, buildExportsAssignment(defNode, id)]);
                } else {
                  _path.replaceWith(buildExportsAssignment(defNode, t.toExpression(declaration.node)));
                }
              } else {
                _path.replaceWith(buildExportsAssignment(t.identifier("default"), declaration.node));
              }
            } else if (_path.isExportNamedDeclaration()) {
              var declaration = _path.get("declaration");
              if (declaration.node) {
                if (declaration.isFunctionDeclaration()) {
                  var id = declaration.node.id;
                  addTo(exports, id.name, id);
                  topNodes.push(buildExportsAssignment(id, id));
                  _path.replaceWith(declaration.node);
                } else if (declaration.isClassDeclaration()) {
                  var id = declaration.node.id;
                  addTo(exports, id.name, id);
                  _path.replaceWithMultiple([declaration.node, buildExportsAssignment(id, id)]);
                  nonHoistedExportNames[id.name] = true;
                } else if (declaration.isVariableDeclaration()) {
                  var declarators = declaration.get("declarations");
                  for (var _iterator4 = declarators, _isArray4 = Array.isArray(_iterator4), _i4 = 0, _iterator4 = _isArray4 ? _iterator4 : _getIterator(_iterator4);;) {
                    var _ref4;

                    if (_isArray4) {
                      if (_i4 >= _iterator4.length) break;
                      _ref4 = _iterator4[_i4++];
                    } else {
                      _i4 = _iterator4.next();
                      if (_i4.done) break;
                      _ref4 = _i4.value;
                    }

                    var decl = _ref4;

                    var id = decl.get("id");

                    var init = decl.get("init");
                    if (!init.node) init.replaceWith(t.identifier("undefined"));

                    if (id.isIdentifier()) {
                      addTo(exports, id.node.name, id.node);
                      init.replaceWith(buildExportsAssignment(id.node, init.node).expression);
                      nonHoistedExportNames[id.node.name] = true;
                    } else {
                      // todo
                    }
                  }
                  _path.replaceWith(declaration.node);
                }
                continue;
              }

              var specifiers = _path.get("specifiers");
              if (specifiers.length) {
                var nodes = [];
                var source = _path.node.source;
                if (source) {
                  var ref = addRequire(source.value, _path.node._blockHoist);

                  for (var _iterator5 = specifiers, _isArray5 = Array.isArray(_iterator5), _i5 = 0, _iterator5 = _isArray5 ? _iterator5 : _getIterator(_iterator5);;) {
                    var _ref5;

                    if (_isArray5) {
                      if (_i5 >= _iterator5.length) break;
                      _ref5 = _iterator5[_i5++];
                    } else {
                      _i5 = _iterator5.next();
                      if (_i5.done) break;
                      _ref5 = _i5.value;
                    }

                    var specifier = _ref5;

                    if (specifier.isExportNamespaceSpecifier()) {
                      // todo
                    } else if (specifier.isExportDefaultSpecifier()) {
                        // todo
                      } else if (specifier.isExportSpecifier()) {
                          topNodes.push(buildExportsFrom(t.stringLiteral(specifier.node.exported.name), t.memberExpression(ref, specifier.node.local)));
                          nonHoistedExportNames[specifier.node.exported.name] = true;
                        }
                  }
                } else {
                  for (var _iterator6 = specifiers, _isArray6 = Array.isArray(_iterator6), _i6 = 0, _iterator6 = _isArray6 ? _iterator6 : _getIterator(_iterator6);;) {
                    var _ref6;

                    if (_isArray6) {
                      if (_i6 >= _iterator6.length) break;
                      _ref6 = _iterator6[_i6++];
                    } else {
                      _i6 = _iterator6.next();
                      if (_i6.done) break;
                      _ref6 = _i6.value;
                    }

                    var specifier = _ref6;

                    if (specifier.isExportSpecifier()) {
                      addTo(exports, specifier.node.local.name, specifier.node.exported);
                      nonHoistedExportNames[specifier.node.exported.name] = true;
                      nodes.push(buildExportsAssignment(specifier.node.exported, specifier.node.local));
                    }
                  }
                }
                _path.replaceWithMultiple(nodes);
              }
            } else if (_path.isExportAllDeclaration()) {
              topNodes.push(buildExportAll({
                KEY: _path.scope.generateUidIdentifier("key"),
                OBJECT: addRequire(_path.node.source.value, _path.node._blockHoist)
              }));
              _path.remove();
            }
          }

          for (var source in imports) {
            var _imports$source = imports[source];
            var specifiers = _imports$source.specifiers;
            var maxBlockHoist = _imports$source.maxBlockHoist;

            if (specifiers.length) {
              var uid = addRequire(source, maxBlockHoist);

              var wildcard = undefined;

              for (var i = 0; i < specifiers.length; i++) {
                var specifier = specifiers[i];
                if (t.isImportNamespaceSpecifier(specifier)) {
                  if (strict) {
                    remaps[specifier.local.name] = uid;
                  } else {
                    var varDecl = t.variableDeclaration("var", [t.variableDeclarator(specifier.local, t.callExpression(this.addHelper("interopRequireWildcard"), [uid]))]);

                    if (maxBlockHoist > 0) {
                      varDecl._blockHoist = maxBlockHoist;
                    }

                    topNodes.push(varDecl);
                  }
                  wildcard = specifier.local;
                } else if (t.isImportDefaultSpecifier(specifier)) {
                  specifiers[i] = t.importSpecifier(specifier.local, t.identifier("default"));
                }
              }

              for (var _iterator7 = specifiers, _isArray7 = Array.isArray(_iterator7), _i7 = 0, _iterator7 = _isArray7 ? _iterator7 : _getIterator(_iterator7);;) {
                var _ref7;

                if (_isArray7) {
                  if (_i7 >= _iterator7.length) break;
                  _ref7 = _iterator7[_i7++];
                } else {
                  _i7 = _iterator7.next();
                  if (_i7.done) break;
                  _ref7 = _i7.value;
                }

                var specifier = _ref7;

                if (t.isImportSpecifier(specifier)) {
                  var target = uid;
                  if (specifier.imported.name === "default") {
                    if (wildcard) {
                      target = wildcard;
                    } else {
                      target = wildcard = path.scope.generateUidIdentifier(uid.name);
                      var varDecl = t.variableDeclaration("var", [t.variableDeclarator(target, t.callExpression(this.addHelper("interopRequireDefault"), [uid]))]);

                      if (maxBlockHoist > 0) {
                        varDecl._blockHoist = maxBlockHoist;
                      }

                      topNodes.push(varDecl);
                    }
                  }
                  remaps[specifier.local.name] = t.memberExpression(target, specifier.imported);
                }
              }
            } else {
              // bare import
              topNodes.push(buildRequire(t.stringLiteral(source)));
            }
          }

          if (hasImports && _Object$keys(nonHoistedExportNames).length) {
            var hoistedExportsNode = t.identifier("undefined");

            for (var _name in nonHoistedExportNames) {
              hoistedExportsNode = buildExportsAssignment(t.identifier(_name), hoistedExportsNode).expression;
            }

            topNodes.unshift(t.expressionStatement(hoistedExportsNode));
          }

          // add __esModule declaration if this file has any exports
          if (hasExports && !strict) {
            var buildTemplate = buildExportsModuleDeclaration;
            if (this.opts.loose) buildTemplate = buildLooseExportsModuleDeclaration;
            topNodes.unshift(buildTemplate());
          }

          path.unshiftContainer("body", topNodes);
          path.traverse(reassignmentVisitor, { remaps: remaps, scope: scope, exports: exports });
        }
      }
    }
  };
};

module.exports = exports["default"];