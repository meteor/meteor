/**
 * @fileoverview Prevent usage of Session
 * @author Dominik Ferber
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------
module.exports = getMeta => context => {

  const {isLintedEnv} = getMeta(context.getFilename())

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  if (!isLintedEnv) {
    return {}
  }

  return {

    MemberExpression (node) {
      if (node.object.name === 'Session') {
        context.report(node, 'Unexpected Session statement')
      }
    }

  }
}

module.exports.schema = []
