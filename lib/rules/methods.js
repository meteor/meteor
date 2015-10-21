/**
 * @fileoverview Core API for methods
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */


import {NON_METEOR} from '../util/environment'
import {getExecutors} from '../util'
import {isMeteorCall, isMeteorProp, getPropertyName, refersTo, hasContext} from '../util/ast'

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

const methodProps = [
  'userId',
  'setUserId',
  'isSimulation',
  'unblock',
  'connection'
]

module.exports = getMeta => context => {

  const {env} = getMeta(context)

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function expectAtLeastOneArgument (node) {
    if (node.arguments.length === 0) {
      context.report(node, 'At least one argument expected')
    }
  }

  function expectAtLeastTwoArguments (node) {
    if (node.arguments.length < 2) {
      context.report(node, 'At least two arguments expected')
    }
  }

  function isMethodProp (property) {
    return methodProps.indexOf(getPropertyName(property)) !== -1
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

  function verifyContextApi (node, executors) {
    const propName = getPropertyName(node.property)
    switch (propName) {
      case 'userId':
        verifyNoCall(node)
        verifyNoReassignment(node)
        break
      case 'setUserId':
        if (executors.has('browser') || executors.has('cordova')) {
          return context.report(node.parent, 'Allowed on server only')
        }

        if (isInCallingPosition(node) && node.parent.arguments.length !== 1) {
          return context.report(node.parent, `Expected one argument`)
        }
        verifyNoReassignment(node)
        break
      case 'isSimulation':
        break
      case 'unblock':
        break
      case 'connection':
        break
    }
  }

  function isMethodContext (scope) {
    return (
      scope.type === 'function' &&
      scope.block.type === 'FunctionExpression' &&
      !!scope.block.parent &&
      scope.block.parent.type === 'Property' &&
      scope.block.parent.value === scope.block &&
      scope.block.parent.parent.type === 'ObjectExpression' &&
      scope.block.parent.parent.parent.type === 'CallExpression' &&
      isMeteorCall(scope.block.parent.parent.parent, 'methods')
    )
  }

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  if (env === NON_METEOR) {
    return {}
  }

  return {

    NewExpression: function (node) {

      if (!isMeteorProp(node.callee, 'Error')) {
        return
      }

      const executors = getExecutors(env, context.getAncestors())
      if (executors.size === 0) {
        return
      }

      if (node.arguments.length === 0) {
        expectAtLeastOneArgument(node)
      } else if (node.arguments[0].type === 'Literal' && typeof node.arguments[0].value !== 'string') {
        context.report(node.arguments[0], 'Expected a string')
      }
    },

    CallExpression: function (node) {

      const executors = getExecutors(env, context.getAncestors())
      if (executors.size === 0) {
        return
      }

      if (isMeteorCall(node, 'apply')) {
        expectAtLeastTwoArguments(node)
      } else if (isMeteorCall(node, 'call')) {
        expectAtLeastOneArgument(node)
      } else if (isMeteorCall(node, 'Error')) {
        context.report(node, 'Missing "new" keyword')
      } else if (isMeteorCall(node, 'methods')) {
        if (node.arguments.length !== 1) {
          context.report(node, 'Expected one argument')
        }
      }
    },

    MemberExpression: function (node) {

      // not accesing one of the publish API props
      if (!isMethodProp(node.property)) {
        return
      }

      const executors = getExecutors(env, context.getAncestors())
      if (executors.size === 0) {
        return
      }

      const scope = context.getScope()
      switch (node.object.type) {
        case 'ThisExpression': {
          if (hasContext(scope, isMethodContext)) {
            verifyContextApi(node, executors)
          }
          break
        }
        case 'Identifier': {
          if (refersTo(scope.resolve(node.object).resolved, isMethodContext)) {
            verifyContextApi(node, executors)
          }
          break
        }
      }
    }
  }

}

module.exports.schema = []
