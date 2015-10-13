/**
 * @fileoverview Prevent usage of Meteor.setTimeout with zero delay
 * @author Dominik Ferber
 */

import {isMeteorCall} from '../util/ast'

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

    CallExpression: function (node) {
      if (isMeteorCall(node, 'setTimeout')) {
        if (node.arguments.length === 1) {
          context.report(node, 'Implicit timeout of 0')
        } else if (
          node.arguments.length > 1 && node.arguments[1].type === 'Literal' && node.arguments[1].value === 0
        ) {
          context.report(node, 'Timeout of 0. Use `Meteor.defer` instead')
        }
      }
    }

  }

}

module.exports.schema = []
