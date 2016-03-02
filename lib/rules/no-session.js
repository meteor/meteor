/**
 * @fileoverview Prevent usage of Session
 * @author Dominik Ferber
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = context => ({
  MemberExpression: (node) => {
    if (node.object.name === 'Session') {
      context.report(node, 'Unexpected Session statement')
    }
  },
})

module.exports.schema = []
