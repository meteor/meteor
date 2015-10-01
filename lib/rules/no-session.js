/**
 * @fileoverview Prevent usage of Session
 * @author Dominik Ferber
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = (/* getMeta */) => context => {
  // const meta = getMeta(context.getFilename())
  // console.log(meta)

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  return {

    MemberExpression (node) {
      if (node.object.name === 'Session') {
        context.report(node, 'Unexpected Session statement.')
      }
    }

  }
}

module.exports.schema = []
