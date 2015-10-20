/**
 * @fileoverview Core API for connections
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

import {NON_METEOR} from '../util/environment'
import {getExecutors} from '../util'
import {isMeteorCall, isMeteorProp, getPropertyName} from '../util/ast'

module.exports = getMeta => context => {

  const {env} = getMeta(context)

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const ALLOWED_ON_CLIENT_ONLY = 'Allowed on client only'
  const ALLOWED_ON_SERVER_ONLY = 'Allowed on server only'
  const EXPECTED_ONE_ARGUMENT = 'Expected one argument'
  const EXPECTED_NO_ARGUMENTS = 'Expected no arguments'
  const ASSIGNMENT_NOT_ALLOWED = 'Assignment not allowed'

  function isDDPConnectProp (node) {
    return (
      node.type === 'MemberExpression' &&
      node.object.type === 'Identifier' &&
      node.object.name === 'DDP' &&
      getPropertyName(node.property) === 'connect'
    )
  }

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  if (env === NON_METEOR) {
    return {}
  }

  return {

    CallExpression: function (node) {
      if (
        !isMeteorCall(node, 'status') &&
        !isMeteorCall(node, 'reconnect') &&
        !isMeteorCall(node, 'disconnect') &&
        !isMeteorCall(node, 'onConnection') &&
        !isDDPConnectProp(node.callee)
      ) {
        return
      }

      const executors = getExecutors(env, context.getAncestors())
      const propertyName = getPropertyName(node.callee.property)

      if (propertyName === 'connect') {
        if (executors.size !== 0 && node.arguments.length !== 1) {
          context.report(node, EXPECTED_ONE_ARGUMENT)
        }
        return
      }

      if (executors.has('server')) {
        switch (propertyName) {
          case 'status':
          case 'reconnect':
          case 'disconnect':
            context.report(node, ALLOWED_ON_CLIENT_ONLY)
            break
          case 'onConnection':
            if (!executors.has('browser') && !executors.has('cordova') && node.arguments.length !== 1) {
              context.report(node, EXPECTED_ONE_ARGUMENT)
            }
            break
        }
      }

      if (executors.has('browser') || executors.has('cordova')) {
        switch (propertyName) {
          case 'status':
          case 'reconnect':
          case 'disconnect':
            if (!executors.has('server') && node.arguments.length !== 0) {
              context.report(node, EXPECTED_NO_ARGUMENTS)
            }
            break
          case 'onConnection':
            context.report(node, ALLOWED_ON_SERVER_ONLY)
            break
        }
      }
    },

    AssignmentExpression: function (node) {
      if (
        !isMeteorProp(node.left, 'status') &&
        !isMeteorProp(node.left, 'reconnect') &&
        !isMeteorProp(node.left, 'disconnect') &&
        !isMeteorProp(node.left, 'onConnection') &&
        !isDDPConnectProp(node.left)
      ) {
        return
      }

      const executors = getExecutors(env, context.getAncestors())
      if (executors.size > 0) {
        context.report(node, ASSIGNMENT_NOT_ALLOWED)
      }
    }

  }

}

module.exports.schema = []
