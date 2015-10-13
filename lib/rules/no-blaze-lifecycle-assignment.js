/**
 * @fileoverview Prevent deprecated template lifecycle callback assignments.
 * @author Dominik Ferber
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = getMeta => context => {

  const {isLintedEnv} = getMeta(context.getFilename())

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /*
   * Check if name is a forbidden property (rendered, created, destroyed)
   * @param {String} name The name of the property
   * @returns {Boolean} True if name is forbidden.
   */
  function isForbidden (name) {
    return ['created', 'rendered', 'destroyed'].indexOf(name) !== -1
  }

  function capitalizeFirstLetter (string) {
    return string.charAt(0).toUpperCase() + string.slice(1)
  }

  function reportError (node, propertyName) {
    context.report(
      node,
      'Template callback assignment with'
      + ' `' + propertyName + '` '
      + 'is deprecated.'
      + ' Use `on' + capitalizeFirstLetter(propertyName) + '` instead'
    )
  }


  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  if (!isLintedEnv) {
    return {}
  }

  return {

    AssignmentExpression: (node) => {

      if (node.operator === '=') {

        const lhs = node.left
        if (
          lhs.type === 'MemberExpression' && !lhs.computed &&
          lhs.object.type === 'MemberExpression' &&
          lhs.object.object.type === 'Identifier' && lhs.object.object.name === 'Template' &&
          lhs.property.type === 'Identifier' && isForbidden(lhs.property.name)
        ) {
          reportError(node, lhs.property.name)
        }

      }

    }

  }
}

module.exports.schema = []
