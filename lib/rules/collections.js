/**
 * @fileoverview Core API for collections
 * @author colDominik Ferber
 * @copyright 2015 colDominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

import {NON_METEOR} from '../util/environment'
import {getExecutors} from '../util'
import {isMeteorProp} from '../util/ast'
import {getMeteorSettings} from '../util'

module.exports = getMeta => context => {

  const {env} = getMeta(context)
  const {collections} = getMeteorSettings(context.settings)

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------


  const collectionProps = [
    'find',
    'findOne',
    'insert',
    'update',
    'upsert',
    'remove',
    'allow',
    'deny',
    'rawCollection',
    'rawDatabase'
  ]

  function expectAtLeastOneArgument (node) {
    if (node.arguments.length === 0) {
      context.report(node, 'At least one argument expected')
    }
  }

  function expectOneArugment (node) {
    if (node.arguments.length !== 1) {
      context.report(node, 'Expected one argument')
    }
  }

  function expectTwoArgumentsAtMost (node) {
    if (node.arguments.length > 2) {
      context.report(node, 'Expected two arguments at most')
    }
  }

  function expectNoArguments (node) {
    if (node.arguments.length !== 0) {
      context.report(node, 'Expected no arguments')
    }
  }

  function expectAtLeastTwoArguments (node) {
    if (node.arguments.length < 2) {
      context.report(node, 'At least two arguments expected')
    }
  }

  function isMongoCollection (node) {
    return (
      node.type === 'MemberExpression' &&
      !node.computed &&
      node.object.type === 'Identifier' &&
      node.object.name === 'Mongo' &&
      node.property.type === 'Identifier' &&
      node.property.name === 'Collection'
    )
  }

  function collectionExists (collectionName) {
    return collections.indexOf(collectionName) !== -1
  }

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  if (env === NON_METEOR) {
    return {}
  }


  return {

    NewExpression: function (node) {

      const isMeteorCollectionInstantiation = isMeteorProp(node.callee, 'Collection')
      const isMongoCollectionInstantiation = isMongoCollection(node.callee)
      if (!isMeteorCollectionInstantiation && !isMongoCollectionInstantiation) {
        return
      }

      const executors = getExecutors(env, context.getAncestors())
      if (executors.size === 0) {
        return
      }

      if (isMeteorCollectionInstantiation) {
        context.report(node, '"Meteor.Collection" is deprecated. Use "Mongo.Collection" instead.')
        return
      }

      if (isMongoCollectionInstantiation && node.arguments.length === 0) {
        context.report(node, 'At least one argument expected')
        return
      }
    },

    ...(
      collections.length ? {
        CallExpression: function (node) {
          if (
            node.callee.type !== 'MemberExpression' ||
            node.callee.computed ||
            node.callee.object.type !== 'Identifier' ||
            node.callee.property.type !== 'Identifier' ||
            !collectionExists(node.callee.object.name) ||
            collectionProps.indexOf(node.callee.property.name) === -1
          ) {
            return
          }

          switch (node.callee.property.name) {
            case 'find':
            case 'findOne':
              expectTwoArgumentsAtMost(node)
              break
            case 'insert':
              expectAtLeastOneArgument(node)
              break
            case 'update':
            case 'upsert':
              expectAtLeastTwoArguments(node)
              break
            case 'remove':
              expectAtLeastOneArgument(node)
              break
            case 'allow':
            case 'deny':
              expectOneArugment(node)
              break
            case 'rawCollection':
            case 'rawDatabase':
              expectNoArguments(node)
              break
          }
        }
      } : {}
    ),

    AssignmentExpression: function (node) {
      if (
        node.left.type === 'Identifier' &&
        collectionExists(node.left.name) &&
        (
          node.right.type !== 'NewExpression' ||
          !isMongoCollection(node.right.callee, 'Collection')
        )
      ) {
        context.report(node, 'Can not overwrite collection')
      }
    },

    VariableDeclarator: function (node) {

      if (
        node.id.type === 'Identifier' &&
        collectionExists(node.id.name)
      ) {
        context.report(node, 'Can not declare collection')
      }
    }
  }

}

module.exports.schema = []
