/**
 * @fileoverview Prevent usage of Session
 * @author Dominik Ferber
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

export default context => ({
  MemberExpression: (node) => {
    if (node.object.name === 'Session') {
      context.report(node, 'Unexpected Session statement')
    }
  },
})

export const schema = []
