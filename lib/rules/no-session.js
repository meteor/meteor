/**
 * @fileoverview Prevent usage of Session
 * @author Dominik Ferber
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = {
  meta: {
    schema: [],
  },
  create: context => ({
    MemberExpression: node => {
      if (node.object.name === 'Session') {
        context.report(node, 'Unexpected Session statement');
      }
    },
  }),
};
