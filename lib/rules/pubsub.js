/**
 * @fileoverview Core API for publications and subscriptions
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

import {isMeteorCall, getPropertyName, hasContext, refersTo} from '../util/ast'
import {getExecutors} from '../util'
import {NON_METEOR} from '../util/environment'

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

const publishProps = [
  'userId',
  'added',
  'changed',
  'removed',
  'ready',
  'onStop',
  'error',
  'stop',
  'connection'
]

module.exports = getMeta => context => {

  const {env} = getMeta(context)

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function expectAtLeastOneArgument (node) {
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
    if (executors.has('browser')) {
      noPublishOnClient(node)
    } else {
      expectTwoArguments(node)
    }
  }

  function checkMeteorSubscribe (node, executors) {
    if (executors.has('server')) {
      noSubscribeOnServer(node)
    } else {
      expectAtLeastOneArgument(node)
    }
  }

  function isPublishProp (property) {
    return publishProps.indexOf(getPropertyName(property)) !== -1
  }

  function verifyNoCall (/* MemberExpression */ node) {
    if (node.parent.type === 'CallExpression' && node.parent.callee === node) {
      context.report(node.parent, 'Not a function')
    }
  }

  function verifyNoReassignment (/* MemberExpression */ node) {
    if (node.parent.type === 'AssignmentExpression' && node.parent.left === node) {
      context.report(node.parent, 'Assignment not allowed')
    } else if (node.parent.type === 'UpdateExpression') {
      context.report(node.parent, 'Update not allowed')
    }
  }

  function isInCallingPosition (/* MemberExpression */ node) {
    return (
      node.parent.type === 'CallExpression' &&
      node.parent.callee === node
    )
  }

  function verifyContextApi (/* MemberExpression */ node) {
    const propName = getPropertyName(node.property)
    switch (propName) {
      case 'connection':
      case 'userId':
        verifyNoCall(node)
        verifyNoReassignment(node)
        break
      case 'added':
      case 'changed':
        verifyNoReassignment(node)
        if (isInCallingPosition(node) && node.parent.arguments.length !== 3) {
          context.report(node.parent, `Expected three arguments`)
        }
        break
      case 'removed':
        verifyNoReassignment(node)
        if (isInCallingPosition(node) && node.parent.arguments.length !== 2) {
          context.report(node.parent, `Expected two arguments`)
        }
        break
      case 'ready':
      case 'stop':
        verifyNoReassignment(node)
        if (isInCallingPosition(node) && node.parent.arguments.length !== 0) {
          context.report(node.parent, `Expected no arguments`)
        }
        break
      case 'onStop':
      case 'error':
        verifyNoReassignment(node)
        if (isInCallingPosition(node) && node.parent.arguments.length !== 1) {
          context.report(node.parent, `Expected one argument`)
        }
        break
    }
  }

  function isPublicationContext (scope) {
    return (
      scope.type === 'function' &&
      scope.block.type === 'FunctionExpression' &&
      !!scope.block.parent &&
      scope.block.parent.type === 'CallExpression' &&
      isMeteorCall(scope.block.parent, 'publish') &&
      scope.block.parent.arguments.length > 1 &&
      scope.block.parent.arguments[1] === scope.block
    )
  }

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  if (env === NON_METEOR) {
    return {}
  }

  return {

    CallExpression: function (node) {

      const executors = getExecutors(env, context.getAncestors())
      if (executors.size === 0) {
        return
      }

      if (isMeteorCall(node, 'publish')) {
        checkMeteorPublish(node, executors)
      } else if (isMeteorCall(node, 'subscribe')) {
        checkMeteorSubscribe(node, executors)
      }
    },

    MemberExpression: function (node) {

      // not accesing one of the publish API props
      if (!isPublishProp(node.property)) {
        return
      }

      const executors = getExecutors(env, context.getAncestors())
      if (executors.size === 0) {
        return
      }

      const scope = context.getScope()

      switch (node.object.type) {
        case 'ThisExpression': {
          const refersToPublication = hasContext(scope, isPublicationContext)
          if (refersToPublication) {
            verifyContextApi(node)
          }
          break
        }
        case 'Identifier': {
          if (refersTo(scope.resolve(node.object).resolved, isPublicationContext)) {
            verifyContextApi(node)
          }
          break
        }
      }
    }

  }
}

module.exports.schema = []
