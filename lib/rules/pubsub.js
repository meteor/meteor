/**
 * @fileoverview Core API for publications and subscriptions
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

import {isMeteorCall} from '../util/ast'
import {getExecutors} from '../util'

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = getMeta => context => {

  const {isLintedEnv, env} = getMeta(context.getFilename())

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function atLeastOneArgument (node) {
    if (node.arguments.length === 0) {
      context.report(node, 'At least one argument expected')
    }
  }

  function expectTwoArguments (node) {
    if (node.arguments.length !== 2) {
      context.report(node, 'Two arguments expected')
    }
  }

  function noPublishOnClient (node) {
    context.report(node, 'Allowed on server only')
  }

  function noSubscribeOnServer (node) {
    context.report(node, 'Allowed on client only')
  }

  function checkMeteorPublish (node, executors) {
    if (!isMeteorCall(node, 'publish')) {
      return
    }

    if (executors.has('browser')) {
      noPublishOnClient(node)
    }

    if (executors.has('server')) {
      expectTwoArguments(node)
    }
  }

  function checkMeteorSubscribe (node, executors) {
    if (!isMeteorCall(node, 'subscribe')) {
      return
    }

    if (executors.has('browser')) {
      atLeastOneArgument(node)
    }
    if (executors.has('server')) {
      noSubscribeOnServer(node)
    }
  }
  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  if (!isLintedEnv) {
    return {}
  }

  return {

    CallExpression: function (node) {

      const ancestors = context.getAncestors()
      const executors = getExecutors(env, ancestors)

      // Meteor.publish
      checkMeteorPublish(node, executors)
      checkMeteorSubscribe(node, executors)
    }

  }
}

module.exports.schema = []
