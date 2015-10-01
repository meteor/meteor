/**
 * @fileoverview Enforce check on all arguments passed to methods and publish functions
 * @author Dominik Ferber
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------


module.exports = () => (context) => {

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function auditArgumentChecks (node) {
    if (node.type === 'FunctionExpression') {
      const checkedParams = []

      // short-circuit
      if (node.params.length === 0) {
        return
      }

      node.body.body.map((expression) => {
        if (
          expression.type === 'ExpressionStatement' &&
          expression.expression.type === 'CallExpression' &&
          expression.expression.callee.type === 'Identifier' &&
          expression.expression.callee.name === 'check' &&
          expression.expression.arguments.length > 1 &&
          expression.expression.arguments[0].type === 'Identifier'
        ) {
          checkedParams.push(expression.expression.arguments[0].name)
        }
      })

      node.params.map((param) => {
        if (param.type === 'Identifier') {
          if (checkedParams.indexOf(param.name) === -1) {
            context.report(param, param.name + ' is not checked')
          }
        }
      })
    }
  }


  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  return {
    CallExpression: (node) => {
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' && node.callee.object.name === 'Meteor'
      ) {

        // publications
        if (
          (node.callee.property.type === 'Identifier' && node.callee.property.name === 'publish') ||
          (node.callee.property.type === 'Literal' && node.callee.property.value === 'publish')
        ) {
          if (node.arguments.length < 2) {
            return
          }

          auditArgumentChecks(node.arguments[1])
        }

        // method
        if (
          (node.callee.property.type === 'Identifier' && node.callee.property.name === 'methods') ||
          (node.callee.property.type === 'Literal' && node.callee.property.value === 'methods')
        ) {
          if (
            node.arguments.length > 0 &&
            node.arguments[0].type === 'ObjectExpression'
          ) {
            node.arguments[0].properties.map(function (property) {
              auditArgumentChecks(property.value)
            })
          }
        }
      }
    }
  }
}

module.exports.schema = []
