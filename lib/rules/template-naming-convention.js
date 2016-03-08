/**
 * @fileoverview Force a naming convention for templates
 * @author Dominik Ferber
 * @copyright 2016 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------
const templateProps = new Set([
  'onCreated',
  'onRendered',
  'onDestroyed',
  'events',
  'helpers',
  'created',
  'rendered',
  'destroyed',
])

const NAMING_CONVENTIONS = {
  CAMEL: 'camel-case',
  PASCAL: 'pascal-case',
  SNAKE: 'snake-case',
}

const isTemplateMemberExpression = node => (
  node.object.type === 'MemberExpression' &&
  node.object.object.type === 'Identifier' &&
  node.object.object.name === 'Template' &&
  node.object.property.type === 'Identifier' &&
  node.property.type === 'Identifier' &&
  templateProps.has(node.property.name)
)

const getErrorMessage = expected => `Invalid template naming convention, expected "${expected}"`

module.exports = context => ({
  MemberExpression: node => {
    if (!isTemplateMemberExpression(node)) return

    const [namingConvention] = context.options
    const templateName = node.object.property.name
    switch (namingConvention) {
      case NAMING_CONVENTIONS.PASCAL:
        if (!/^[A-Z]([A-Z]|[a-z]|[0-9])*$/.test(templateName)) {
          context.report(node, getErrorMessage(NAMING_CONVENTIONS.PASCAL))
        }
        break
      case NAMING_CONVENTIONS.SNAKE:
        if (templateName.toLowerCase() !== templateName) {
          context.report(node, getErrorMessage(NAMING_CONVENTIONS.SNAKE))
        }
        break
      case NAMING_CONVENTIONS.CAMEL:
      default:
        if (!/^[a-z]([A-Z]|[a-z]|[0-9])+$/.test(templateName)) {
          context.report(node, getErrorMessage(NAMING_CONVENTIONS.CAMEL))
        }
        break
    }
  },
})

module.exports.schema = [
  { enum: Object.values(NAMING_CONVENTIONS) },
]
