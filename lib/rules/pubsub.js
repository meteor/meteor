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

  function getUpperScopes (scope, cur = []) {
    if (!scope.upper) {
      return cur
    }
    return getUpperScopes(scope.upper, [...cur, scope.upper])
  }

  /*
      https://github.com/estools/escope/blob/master/src/scope.js
      possible scope types:
        - TDZ
        - module
        - block
        - switch
        - function
        - catch
        - with
        - function
        - class
        - global
   */
  /**
   * Takes a scope and searches it and its ancestors for publication
   * function scopes. If it finds a scope changing the context, it will stop
   * the search as there is no way "this" will refer to the publication
   * function scope then.
   * @param {[Scope]} scope The scope to start the search at
   * @return {Boolean} true if the context refers to a publication function
   */
  function isPubFnContext (scope) {
    const scopes = [scope, ...getUpperScopes(scope)]
    let continueSearch = true
    const contextChangingScopeTypes = new Set(['class', 'function'])
    return scopes.reduce((prev, currentScope) => {
      if (!continueSearch) {
        return prev
      }
      if (

        // "this" refers to a publication function, because the scope is created by it
        currentScope.type === 'function' &&
        currentScope.block.type === 'FunctionExpression' &&
        !!currentScope.block.parent &&
        currentScope.block.parent.type === 'CallExpression' &&
        isMeteorCall(currentScope.block.parent, 'publish') &&
        currentScope.block.parent.arguments.length > 1 &&
        currentScope.block.parent.arguments[1] === currentScope.block
      ) {
        continueSearch = false
        return true
      } else if (

        // scope changes context, "this" no longer refers to publication
        contextChangingScopeTypes.has(currentScope.type) &&
        (!currentScope.block || currentScope.block.type !== 'ArrowFunctionExpression')
      ) {
        continueSearch = false
      }
      return false
    }, false)
  }

  // Support `var self = this` with limitations:
  //   - the variable representing `this` may only be assigend once,
  //   - must be assigned upon definition
  //   - must be defined before usage (no hoisting)
  function areRefsTrackable (refs) {
    if (!refs || refs.length === 0) {
      return false
    }

    // must be assigned to `this` on declaration
    const assignment = refs[0]
    if (!assignment.writeExpr || assignment.writeExpr.type !== 'ThisExpression') {
      return false
    }

    // may not be re-assigned
    if (refs.filter(ref => ref.writeExpr).length !== 1) {
      return false
    }
    return true
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

      switch (node.object.type) {
        case 'ThisExpression': {

          // now check whether 'this' refers to a publication or not
          const scope = context.getScope()
          const refersToPublication = isPubFnContext(scope)
          if (refersToPublication) {
            verifyContextApi(node)
          }
          break
        }
        case 'Identifier': {
          const resolvedNode = context.getScope().resolve(node.object)
          const {resolved} = resolvedNode
          const refs = resolved && resolved.references
          if (!areRefsTrackable(refs)) {
            return
          }

          const refersToPublication = isPubFnContext(resolved.scope)
          if (refersToPublication) {
            verifyContextApi(node)
          }
          break
        }
      }
    }

  }
}

module.exports.schema = []
