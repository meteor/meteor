/**
 * @fileoverview Core API for check and Match
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

import {NON_METEOR} from '../util/environment'
import {getExecutors} from '../util'

module.exports = getMeta => context => {

  const {env} = getMeta(context)

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const ONE_ARGUMENT_EXPECTED = 'Expected one argument'
  const TWO_ARGUMENTS_EXPECTED = 'Two arguments expected'
  const ASSIGNMENT_NOT_ALLOWED = 'Assignment not allowed'
  const UPDATE_NOT_ALLOWED = 'Update not allowed'
  const NOT_A_FUNCTION = 'Not a function'
  const AT_LEAST_TWO_ARGUMENTS_EXPECTED = 'At least two arguments expected'

  const matchProps = [
    'test',
    'Any',
    'Integer',
    'ObjectIncluding',
    'Optional',
    'OneOf',
    'Where'
  ]

  function isCheckNode (node) {
    return node.type === 'Identifier' && node.name === 'check'
  }

  function isMatchNode (node) {
    return (
      node.type === 'MemberExpression' &&
      node.object.type === 'Identifier' &&
      node.object.name === 'Match'
    )
  }

  function verifyNoCall (/* MemberExpression */ node) {
    if (node.parent.type === 'CallExpression' && node.parent.callee === node) {
      context.report(node.parent, NOT_A_FUNCTION)
    }
  }

  function verifyNoMutate (node) {
    if (node.parent.type === 'UpdateExpression') {
      context.report(node.parent, UPDATE_NOT_ALLOWED)
    } else if (node.parent.type === 'AssignmentExpression' && node.parent.left === node) {
      context.report(node.parent, ASSIGNMENT_NOT_ALLOWED)
    }
  }

  function verifyTwoArguments (node) {
    if (
      node.parent.type === 'CallExpression' &&
      node.parent.callee === node &&
      node.parent.arguments.length !== 2
    ) {
      context.report(node.parent, TWO_ARGUMENTS_EXPECTED)
    }
  }

  function verifyOneArgument (node) {
    if (
      node.parent.type === 'CallExpression' &&
      node.parent.callee === node &&
      node.parent.arguments.length !== 1
    ) {
      context.report(node.parent, ONE_ARGUMENT_EXPECTED)
    }
  }

  function verifyAtLeastTwoArguments (node) {
    if (
      node.parent.type === 'CallExpression' &&
      node.parent.callee === node &&
      node.parent.arguments.length < 2
    ) {
      context.report(node.parent, AT_LEAST_TWO_ARGUMENTS_EXPECTED)
    }
  }

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  if (env === NON_METEOR) {
    return {}
  }

  return {

    CallExpression: function (node) {
      if (isCheckNode(node.callee)) {
        const executors = getExecutors(env, context.getAncestors())
        if (executors.size === 0) {
          return
        }

        if (node.arguments.length !== 2) {
          context.report(node, TWO_ARGUMENTS_EXPECTED)
        }
      }
    },

    AssignmentExpression: function (node) {
      if (isCheckNode(node.left)) {
        const executors = getExecutors(env, context.getAncestors())
        if (executors.size === 0) {
          return
        }
        context.report(node, ASSIGNMENT_NOT_ALLOWED)
      }
    },

    UpdateExpression: function (node) {
      if (isCheckNode(node.argument)) {
        const executors = getExecutors(env, context.getAncestors())
        if (executors.size === 0) {
          return
        }
        context.report(node, UPDATE_NOT_ALLOWED)
      }
    },


    MemberExpression: function (node) {
      if (!isMatchNode(node) || node.computed || node.property.type !== 'Identifier') {
        return
      }

      const matchProp = node.property.name
      if (matchProps.indexOf(matchProp) === -1) {
        return
      }

      const executors = getExecutors(env, context.getAncestors())
      if (executors.size === 0) {
        return
      }

      switch (matchProp) {
        case 'Any':
        case 'Integer':
          verifyNoCall(node)
          verifyNoMutate(node)
          break
        case 'test':
          verifyNoMutate(node)
          verifyTwoArguments(node)
          break
        case 'ObjectIncluding':
          verifyOneArgument(node)
          verifyNoMutate(node)
          break
        case 'Optional':
          verifyOneArgument(node)
          verifyNoMutate(node)
          break
        case 'OneOf':
          verifyNoMutate(node)
          verifyAtLeastTwoArguments(node)
          break
        case 'Where':
          verifyOneArgument(node)
          verifyNoMutate(node)
          break
      }
    }

  }
}

module.exports.schema = []
