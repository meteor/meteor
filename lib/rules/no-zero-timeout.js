/**
 * @fileoverview Prevent usage of Meteor.setTimeout with zero delay
 * @author Dominik Ferber
 */

import {NON_METEOR} from '../util/environment'
import {getExecutors} from '../util'
import {isMeteorCall} from '../util/ast'

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = getMeta => context => {

  const {env} = getMeta(context.getFilename())

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  if (env === NON_METEOR) {
    return {}
  }

  return {

    CallExpression: function (node) {
      if (isMeteorCall(node, 'setTimeout')) {
        const executors = getExecutors(env, context)
        if (!executors.has('browser') && !executors.has('cordova')) {
          return
        }

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
