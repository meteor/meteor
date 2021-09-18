/**
 * @fileoverview Force a naming convention for templates
 * @author Dominik Ferber
 * @copyright 2016 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

const values = require('../util/values');

const templateProps = new Set([
  'onCreated',
  'onRendered',
  'onDestroyed',
  'events',
  'helpers',
  'created',
  'rendered',
  'destroyed',
]);

const NAMING_CONVENTIONS = {
  CAMEL: 'camel-case',
  PASCAL: 'pascal-case',
  SNAKE: 'snake-case',
  UPPER_SNAKE: 'upper-snake-case',
};

const isTemplateMemberExpression = (node) =>
  node.object.type === 'MemberExpression' &&
  node.object.object.type === 'Identifier' &&
  node.object.object.name === 'Template' &&
  (node.object.property.type === 'Identifier' ||
    node.object.property.type === 'Literal') &&
  node.property.type === 'Identifier' &&
  templateProps.has(node.property.name);

// assuming node type is always either Identifier or Literal
const getNameOfProperty = (node) =>
  node.type === 'Identifier' ? node.name : node.value;

const getErrorMessage = (expected) =>
  `Invalid template name, expected name to be in ${expected}`;

module.exports = {
  meta: {
    schema: [{ enum: values(NAMING_CONVENTIONS) }],
  },
  create: (context) => ({
    MemberExpression: (node) => {
      if (!isTemplateMemberExpression(node)) return;

      const [namingConvention] = context.options;
      const templateName = getNameOfProperty(node.object.property);
      switch (namingConvention) {
        case NAMING_CONVENTIONS.PASCAL:
          if (!/^[A-Z]([A-Z]|[a-z]|[0-9])*$/.test(templateName)) {
            context.report(node, getErrorMessage(NAMING_CONVENTIONS.PASCAL));
          }
          break;
        case NAMING_CONVENTIONS.SNAKE:
          if (!/^([a-z]|[0-9]|_)+$/i.test(templateName)) {
            context.report(node, getErrorMessage(NAMING_CONVENTIONS.SNAKE));
          }
          break;
        case NAMING_CONVENTIONS.UPPER_SNAKE:
          if (!/^[A-Z]([a-z]|[A-Z]|[0-9]|_)+$/.test(templateName)) {
            context.report(
              node,
              getErrorMessage(NAMING_CONVENTIONS.UPPER_SNAKE)
            );
          }
          break;
        case NAMING_CONVENTIONS.CAMEL:
        default:
          if (!/^[a-z]([A-Z]|[a-z]|[0-9])+$/.test(templateName)) {
            context.report(node, getErrorMessage(NAMING_CONVENTIONS.CAMEL));
          }
          break;
      }
    },
  }),
};
