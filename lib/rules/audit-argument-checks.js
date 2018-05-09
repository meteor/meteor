/**
 * @fileoverview Enforce check on all arguments passed to methods and publish functions
 * @author Dominik Ferber
 */

const { isMeteorCall, isFunction } = require('../util/ast');

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = {
  meta: {
    schema: [],
  },
  create: context => {
    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    function auditArgumentChecks(node) {
      if (!isFunction(node.type)) {
        return;
      }

      const checkedParams = [];

      // short-circuit
      if (node.params.length === 0) {
        return;
      }

      if (node.body.type === 'BlockStatement') {
        node.body.body.forEach(expression => {
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
          if (
            expression.type === 'ExpressionStatement' &&
            expression.expression.type === 'CallExpression' &&
            expression.expression.callee.type === 'Identifier' &&
            expression.expression.callee.name === 'check' &&
            expression.expression.arguments.length > 1 &&
            expression.expression.arguments[0].type === 'ArrayExpression'
          ) {
            expression.expression.arguments[0].elements.forEach(element => {
              if (element.type === 'Identifier')
                checkedParams.push(element.name);
            });
          }
        });
      }

      node.params.forEach(param => {
        if (param.type === 'Identifier') {
          if (checkedParams.indexOf(param.name) === -1) {
            context.report(param, `"${param.name}" is not checked`);
          }
        }
      });
    }

    // ---------------------------------------------------------------------------
    // Public
    // ---------------------------------------------------------------------------

    return {
      CallExpression: node => {
        // publications
        if (isMeteorCall(node, 'publish') && node.arguments.length >= 2) {
          auditArgumentChecks(node.arguments[1]);
          return;
        }

        // method
        if (
          isMeteorCall(node, 'methods') &&
          (node.arguments.length > 0 &&
            node.arguments[0].type === 'ObjectExpression')
        ) {
          node.arguments[0].properties.forEach(property => {
            auditArgumentChecks(property.value);
          });
        }
      },
    };
  },
};
