/**
 * @fileoverview Prevent usage of Meteor.setTimeout with zero delay
 * @author Dominik Ferber
 */

const { isMeteorCall } = require('../util/ast');

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = {
  meta: {
    schema: [],
  },
  create: context => ({
    CallExpression: node => {
      if (isMeteorCall(node, 'setTimeout')) {
        if (node.arguments.length === 1) {
          context.report(node, 'Implicit timeout of 0');
        } else if (
          node.arguments.length > 1 &&
          node.arguments[1].type === 'Literal' &&
          node.arguments[1].value === 0
        ) {
          context.report(node, 'Timeout of 0. Use `Meteor.defer` instead');
        }
      }
    },
  }),
};
