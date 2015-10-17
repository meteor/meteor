/**
 * @fileoverview Prevent usage of Session
 * @author Dominik Ferber
 */

import {NON_METEOR} from '../util/environment'
import {getExecutors} from '../util'

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = getMeta => context => {

  const {env} = getMeta(context)

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  if (env === NON_METEOR) {
    return {}
  }

  return {
    MemberExpression (node) {
      if (node.object.name === 'Session') {

        const executors = getExecutors(env, context.getAncestors())
        if (!executors.has('browser') && !executors.has('cordova')) {
          return
        }

        context.report(node, 'Unexpected Session statement')
      }
    }

  }
}

module.exports.schema = []
