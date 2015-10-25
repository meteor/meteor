/**
 * @fileoverview Core API for Session
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

import {NON_METEOR, SERVER} from '../util/environment'
import {getExecutors} from '../util'
import {getPropertyName} from '../util/ast'

module.exports = getMeta => context => {
  const {env} = getMeta(context)

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  if (env === NON_METEOR || env === SERVER) {
    return {}
  }

  return {

    CallExpression: function (node) {
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Session'
      ) {
        const executors = getExecutors(env, context.getAncestors())
        if (executors.size === 0) {
          return
        }
        if (executors.has('server')) {
          context.report(node, 'Allowed on client only')
          return
        }

        switch (getPropertyName(node.callee.property)) {
          case 'set':
          case 'setDefault':
          case 'equals':
            if (node.arguments.length !== 2) {
              context.report(node, 'Expected two arguments')
            }
            break
          case 'get':
            if (node.arguments.length !== 1) {
              context.report(node, 'Expected one argument')
            }
            break
          case 'equal':
            if (context.options.length > 0 && context.options[0] === 'no-equal') {
              context.report(node.callee.property, 'Did you mean "Session.equals" instead?')
            }
            break
        }
      }
    }

  }
}

module.exports.schema = [
  {
    enum: ['equal', 'no-equal']
  }
]
