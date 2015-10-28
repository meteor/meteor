/**
 * @fileoverview Ensures consistent parameter names in blaze event maps
 * @author Philipp Sporrer, Dominik Ferber
 * @copyright 2015 Philipp Sporrer. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

import {isFunction, isTemplateProp} from '../util/ast'
import {getExecutors} from '../util'
import {NON_METEOR} from '../util/environment'

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = getMeta => context => {

  const {env} = getMeta(context)

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function ensureParamName (param, expectedParamName) {
    if (param && param.name !== expectedParamName) {
      context.report(
        param,
        `Invalid parameter name, use "${expectedParamName}" instead`
      )
    }
  }

  function validateEventDef (eventDefNode) {

    const eventHandler = eventDefNode.value
    if (isFunction(eventHandler.type)) {

      ensureParamName(
        eventHandler.params[0],
        context.options[0] ? context.options[0].eventParamName : 'event'
      )

      ensureParamName(
        eventHandler.params[1],
        context.options[0] ? context.options[0].templateInstanceParamName : 'templateInstance'
      )
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

      if (node.arguments.length === 0 || !isTemplateProp(node.callee, 'events')) {
        return
      }
      const executors = getExecutors(env, context.getAncestors())
      if (executors.has('browser') || executors.has('cordova')) {
        const eventMap = node.arguments[0]

        if (eventMap.type === 'ObjectExpression') {
          eventMap.properties.forEach((eventDef) => validateEventDef(eventDef))
        }
      }
    }

  }

}

module.exports.schema = [
  {
    type: 'object',
    properties: {
      eventParamName: {
        type: 'string'
      },
      templateInstanceParamName: {
        type: 'string'
      }
    },
    additionalProperties: false
  }
]
