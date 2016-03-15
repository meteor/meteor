/**
 * @fileoverview Convention for eventmap selectors
 * @author Dominik Ferber
 * @copyright 2016 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

import { isTemplateProp } from '../util/ast'

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

export default context => {
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const [prefix = 'js-', mode = 'relaxed'] = context.options

  // algorithm to parse event map selector taken from blaze itself
  // https://github.com/meteor/meteor/blob/15a0369581ef27a6d3d49cb0110d10b1198d5383/packages/blaze/view.js#L867
  function validateEventDefinition(node) {
    if (node.key.type !== 'Literal') return

    const spec = node.key.value
    const clauses = spec.split(/,\s+/)
    clauses.forEach(clause => {
      const parts = clause.split(/\s+/)

      if (parts.length === 1) {
        if (mode === 'strict') {
          context.report(node.key, 'Missing selector')
        }
        return
      }

      const selector = parts[1]

      if (selector.startsWith('.')) {
        if (!selector.startsWith(`.${prefix}`)) {
          context.report(node.key, `Expected selector to be prefixed with "${prefix}"`)
          return
        } else if (selector === `.${prefix}`) {
          context.report(node.key, 'Selector may not consist of prefix only')
          return
        }
      } else if (mode === 'strict') {
        context.report(node.key, 'Expected selector to be a class')
        return
      }
    })
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
  { type: 'string' },
  { enum: ['relaxed', 'strict'] },
]
