/**
 * @fileoverview Prefer Session.equals in conditions
 * @author Dominik Ferber
 * @copyright 2016 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

const isSessionGetCallExpression = (node) =>
  node.type === 'CallExpression' &&
  node.callee.type === 'MemberExpression' &&
  node.callee.object.type === 'Identifier' &&
  node.callee.object.name === 'Session' &&
  ((!node.callee.computed &&
    node.callee.property.type === 'Identifier' &&
    node.callee.property.name === 'get') ||
    (node.callee.computed &&
      node.callee.property.type === 'Literal' &&
      node.callee.property.value === 'get'));

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = {
  meta: {
    schema: [],
  },
  create: (context) => {
    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------
    const errorMessage = 'Use "Session.equals" instead';

    const checkTest = (node) => {
      switch (node.type) {
        case 'BinaryExpression':
        case 'LogicalExpression':
          checkTest(node.left);
          checkTest(node.right);
          break;
        case 'CallExpression':
          if (isSessionGetCallExpression(node)) {
            context.report(node.callee, errorMessage);
          }
          break;
        default:
          break;
      }
    };

    // ---------------------------------------------------------------------------
    // Public
    // ---------------------------------------------------------------------------
    return {
      ConditionalExpression: (node) => {
        checkTest(node.test);
      },
      IfStatement: (node) => checkTest(node.test),
    };
  },
};
