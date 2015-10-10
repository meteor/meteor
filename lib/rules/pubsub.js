/**
 * @fileoverview Core API for publications and subscriptions
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

import {CLIENT, SERVER, UNIVERSAL} from '../util/environment'
import {isMeteorCall, isInServerBlock, isInClientBlock} from '../util/ast'

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = getMeta => context => {
  const {env} = getMeta(context.getFilename())

  if (env !== CLIENT && env !== SERVER && env !== UNIVERSAL) {
    return {}
  }

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

  function checkMeteorPublish (node, ancestors) {
    if (!isMeteorCall(node, 'publish')) {
      return
    }

    switch (env) {
      case CLIENT:
        noPublishOnClient(node)
        break
      case SERVER:
        expectTwoArguments(node)
        break
      case UNIVERSAL:
        if (isInServerBlock(ancestors)) {
          expectTwoArguments(node)
        } else {
          noPublishOnClient(node)
        }
        break
    }
  }

  function checkMeteorSubscribe (node, ancestors) {
    if (!isMeteorCall(node, 'subscribe')) {
      return
    }

    switch (env) {
      case CLIENT:
        atLeastOneArgument(node)
        break
      case SERVER:
        noSubscribeOnServer(node)
        break
      case UNIVERSAL:
        if (isInClientBlock(ancestors)) {
          atLeastOneArgument(node)
        } else {
          noSubscribeOnServer(node)
        }
        break
    }
  }
  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  return {

    CallExpression: function (node) {

      const ancestors = context.getAncestors()

      // Meteor.publish
      checkMeteorPublish(node, ancestors)
      checkMeteorSubscribe(node, ancestors)
    }

  }
}

module.exports.schema = []
