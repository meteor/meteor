/**
 * @fileoverview Core API for publications and subscriptions
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

import {isMeteorCall, getPropertyName} from '../util/ast'
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
  const publishFunctionScopeBlocks = new Set()

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
      if (node.arguments.length >= 2 && node.arguments[1].type !== 'ArrowFunctionExpression') {
        markAsMeteorPublicationFn(node.arguments[1])
      }
    }
  }

  function checkMeteorSubscribe (node, executors) {
    if (executors.has('server')) {
      noSubscribeOnServer(node)
    } else {
      expectAtLeastOneArgument(node)
    }
  }

  function isMeteorPublicationFnScope (scope) {
    return (
      scope.type === 'function' &&
      (
        scope.block &&
        (scope.block.type === 'FunctionExpression' || scope.block.type === 'ArrowFunctionExpression') &&
        publishFunctionScopeBlocks.has(scope.block)
      )
    )
  }

  function markAsMeteorPublicationFn (block) {
    publishFunctionScopeBlocks.add(block)
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

    ArrowFunctionExpression: function (node) {
      if (getExecutors(env, context.getAncestors()).size === 0) {
        return
      }

      const scope = context.getScope()
      if (scope.upper && scope.upper.type === 'function' && publishFunctionScopeBlocks.has(scope.upper.block)) {
        markAsMeteorPublicationFn(node)
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

      switch (node.object.type) {
        case 'ThisExpression':

          // now check whether 'this' refers to a publication or not
          const scope = context.getScope()
          if (isMeteorPublicationFnScope(scope)) {
            verifyContextApi(node)
          }
          break

        case 'Identifier':

          // Support `var self = this` with limitations:
          //   - the variable representing `this` may only be assigend once,
          //   - must be assigned upon definition
          //   - must be defined before usage (no hoisting)
          const resolvedNode = context.getScope().resolve(node.object)
          const refs = resolvedNode && resolvedNode.resolved && resolvedNode.resolved.references

          if (!refs || refs.length === 0) {
            return
          }

          // must be assigned to `this` on declaration
          const assignment = refs[0]
          if (!assignment.writeExpr || assignment.writeExpr.type !== 'ThisExpression') {
            return
          }

          // may not be re-assigned
          if (refs.filter(ref => ref.writeExpr).length !== 1) {
            return
          }

          if (
            assignment.resolved &&
            assignment.resolved.scope &&
            assignment.resolved.scope.type === 'function' &&
            assignment.resolved.scope.block.type === 'FunctionExpression' &&
            publishFunctionScopeBlocks.has(assignment.resolved.scope.block)
          ) {
            verifyContextApi(node)
          }
          break
      }
    },

    'Program:exit': function () {
      publishFunctionScopeBlocks.clear()
    }

  }
}

module.exports.schema = []
