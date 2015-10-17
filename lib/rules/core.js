/**
 * @fileoverview Meteor Core API
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

import {isMeteorProp, isMeteorCall} from '../util/ast'
import {getExecutors} from '../util'
import {NON_METEOR} from '../util/environment'

module.exports = getMeta => context => {

  const {env} = getMeta(context)

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function disallowCoreChanges (node, report) {
    if (
      isMeteorProp(node, 'isClient') ||
      isMeteorProp(node, 'isServer') ||
      isMeteorProp(node, 'isCordova') ||
      isMeteorProp(node, 'startup') ||
      isMeteorProp(node, 'wrapAsync') ||
      isMeteorProp(node, 'absoluteUrl') ||
      isMeteorProp(node, 'settings') ||
      isMeteorProp(node, 'release')
    ) {
      report()
    }
  }

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  if (env === NON_METEOR) {
    return {}
  }

  return {

    AssignmentExpression: function (node) {
      if (getExecutors(env, context.getAncestors()).size === 0) {
        return
      }
      disallowCoreChanges(node.left, () => context.report(node, 'Assignment not allowed'))
    },

    UpdateExpression: function (node) {
      if (getExecutors(env, context.getAncestors()).size === 0) {
        return
      }

      disallowCoreChanges(node.argument, () => context.report(node, 'Update not allowed'))
    },

    CallExpression: function (node) {
      if (getExecutors(env, context.getAncestors()).size === 0) {
        return false
      }

      const argumentLength = node.arguments.length

      if (isMeteorCall(node, 'startup')) {
        if (argumentLength === 0) {
          return context.report(node, 'Expected one argument')
        } else if (argumentLength > 1) {
          return context.report(node, 'Expected one argument only')
        }
      } else if (isMeteorCall(node, 'wrapAsync')) {
        if (argumentLength === 0) {
          return context.report(node, 'Expected at least one argument')
        } else if (argumentLength > 2) {
          return context.report(node, 'Expected no more than two arguments')
        }
      } else if (isMeteorCall(node, 'absoluteUrl')) {
        if (argumentLength > 2) {
          return context.report(node, 'Expected no more than two arguments')
        }
      }
    }
  }

}

module.exports.schema = []
