/**
 * @fileoverview Ensures consistent parameter names in blaze event maps
 * @author Philipp Sporrer, Dominik Ferber, Rúnar Berg Baugsson Sigríðarson
 * @copyright 2016 Philipp Sporrer. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

import { isFunction, isTemplateProp } from '../util/ast'

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

export default context => {
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  function ensureParamName(param, expectedParamName, preventDestructuring) {
    if (param) {
      if (param.type === 'ObjectPattern' && preventDestructuring) {
        context.report(
          param,
          `Unexpected destructuring, use name "${expectedParamName}"`
        )
      } else if (param.type === 'Identifier' && param.name !== expectedParamName) {
        context.report(
          param,
          `Invalid parameter name, use "${expectedParamName}" instead`
        )
      }
    }
  }

  function validateEventDefinition(node) {
    const eventHandler = node.value
    if (isFunction(eventHandler.type)) {
      const {
        eventParamName = 'event',
        templateInstanceParamName = 'templateInstance',
        preventDestructuring = 'neither',
      } = context.options[0] || {}

      ensureParamName(
        eventHandler.params[0],
        eventParamName,
        preventDestructuring === 'both' || preventDestructuring === 'event'
      )
      ensureParamName(
        eventHandler.params[1],
        templateInstanceParamName,
        preventDestructuring === 'both' || preventDestructuring === 'templateInstance'
      )
    }
  }

  // ---------------------------------------------------------------------------
  // Public
  // ---------------------------------------------------------------------------

  return {
    CallExpression: (node) => {
      if (node.arguments.length === 0 || !isTemplateProp(node.callee, 'events')) {
        return
      }
      const eventMap = node.arguments[0]

      if (eventMap.type === 'ObjectExpression') {
        eventMap.properties.forEach(validateEventDefinition)
      }
    },
  }
}

export const schema = [
  {
    type: 'object',
    properties: {
      eventParamName: {
        type: 'string',
      },
      templateInstanceParamName: {
        type: 'string',
      },
    },
    additionalProperties: false,
  },
]
