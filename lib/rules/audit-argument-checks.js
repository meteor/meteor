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
    schema: [
      {
        type: 'object',
        properties: {
          checkEquivalents: {
            type: 'array',
            items: {
              type: 'string',
              minLength: 1,
            },
          },
        },
        additionalProperties: false,
      },
    ],
  },
  create: (context) => {
    const options = context.options[0];

    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    function isCheck(expression) {
      if (expression.callee.name === 'check') {
        // Require a second argument for literal check()
        return expression.arguments.length > 1;
      } else if (options && Array.isArray(options.checkEquivalents)) {
        // Allow any number of arguments for checkEquivalents
        return options.checkEquivalents.includes(expression.callee.name);
      } else {
        return false;
      }
    }

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
        node.body.body.forEach((expression) => {
          if (
            expression.type === 'ExpressionStatement' &&
            expression.expression.type === 'CallExpression' &&
            expression.expression.callee.type === 'Identifier' &&
            isCheck(expression.expression) &&
            expression.expression.arguments.length > 0 &&
            expression.expression.arguments[0].type === 'Identifier'
          ) {
            checkedParams.push(expression.expression.arguments[0].name);
          }
          if (
            expression.type === 'ExpressionStatement' &&
            expression.expression.type === 'CallExpression' &&
            expression.expression.callee.type === 'Identifier' &&
            isCheck(expression.expression) &&
            expression.expression.arguments.length > 0 &&
            expression.expression.arguments[0].type === 'ArrayExpression'
          ) {
            expression.expression.arguments[0].elements.forEach((element) => {
              if (element.type === 'Identifier')
                checkedParams.push(element.name);
            });
          }
        });
      }

      node.params.forEach((param) => {
        if (param.type === 'Identifier') {
          if (checkedParams.indexOf(param.name) === -1) {
            context.report(param, `"${param.name}" is not checked`);
          }
        } else if (
          // check params with default assignments
          param.type === 'AssignmentPattern' &&
          param.left.type === 'Identifier'
        ) {
          if (checkedParams.indexOf(param.left.name) === -1) {
            context.report(param.left, `"${param.left.name}" is not checked`);
          }
        }
      });
    }

    // ---------------------------------------------------------------------------
    // Public
    // ---------------------------------------------------------------------------

    return {
      CallExpression: (node) => {
        // publications
        if (isMeteorCall(node, 'publish') && node.arguments.length >= 2) {
          auditArgumentChecks(node.arguments[1]);
          return;
        }

        // method
        if (
          isMeteorCall(node, 'methods') &&
          node.arguments.length > 0 &&
          node.arguments[0].type === 'ObjectExpression'
        ) {
          node.arguments[0].properties.forEach((property) => {
            auditArgumentChecks(property.value);
          });
        }
      },
    };
  },
};
