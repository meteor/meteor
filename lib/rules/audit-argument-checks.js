/**
 * @fileoverview Enforce check on all arguments passed to methods and publish functions
 * @author Dominik Ferber
 */
'use strict';

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------


module.exports = function (context) {

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function auditArgumentChecks (node) {
    if (node.type === 'FunctionExpression') {
      var checkedParams = [];

      // short-circuit
      if (node.params.length === 0) {
        return;
      }

      node.body.body.map(function (expression) {
        if (
          expression.type === 'ExpressionStatement' &&
          expression.expression.type === 'CallExpression' &&
          expression.expression.callee.type === 'Identifier' &&
          expression.expression.callee.name === 'check' &&
          expression.expression.arguments.length > 1 &&
          expression.expression.arguments[0].type === 'Identifier'
        ) {
          checkedParams.push(expression.expression.arguments[0].name);
        }
      });

      node.params.map(function (param) {
        if (param.type === 'Identifier') {
          if (checkedParams.indexOf(param.name) === -1) {
            context.report(param, param.name + ' is not checked');
          }
        }
      });
    }
  }


  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  return {
    CallExpression: function (node) {
      if (
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.object.type === 'Identifier' && node.callee.object.name === 'Meteor'
      ) {

        // publications
        if (node.callee.property.name === 'publish') {
          if (node.arguments.length < 2) {
            return;
          }

          auditArgumentChecks(node.arguments[1]);
        }

        // method
        if (node.callee.property.name === 'methods') {
          if (
            node.arguments.length > 0 &&
            node.arguments[0].type === 'ObjectExpression'
          ) {
            node.arguments[0].properties.map(function (property) {
              auditArgumentChecks(property.value);
            });
          }
        }
      }
    }
  };

};

module.exports.schema = [];
