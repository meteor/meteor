/**
 * @fileoverview Enforce check on all arguments passed to methods and publish functions
 * @author Dominik Ferber
 */

import {isMeteorCall, isFunction} from '../util/ast'

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------


module.exports = getMeta => context => {

  const {isLintedEnv} = getMeta(context.getFilename())

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function auditArgumentChecks (node) {
    if (!isFunction(node.type)) {
      return
    }

    const checkedParams = []

    // short-circuit
    if (node.params.length === 0) {
      return
    }

    if (node.body.type === 'BlockStatement') {
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
    }

    node.params.map((param) => {
      if (param.type === 'Identifier') {
        if (checkedParams.indexOf(param.name) === -1) {
          context.report(param, param.name + ' is not checked')
        }
      }
    })
  }


  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  if (!isLintedEnv) {
    return {}
  }

  return {
    CallExpression: (node) => {

      // publications
      if (isMeteorCall(node, 'publish') && node.arguments.length >= 2) {
        return auditArgumentChecks(node.arguments[1])
      }

      // method
      if (
        isMeteorCall(node, 'methods') &&
        (node.arguments.length > 0 && node.arguments[0].type === 'ObjectExpression')
      ) {
        node.arguments[0].properties.map(function (property) {
          return auditArgumentChecks(property.value)
        })
      }
    }
  }
}

module.exports.schema = []
