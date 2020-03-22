/**
 * @fileoverview Scope DOM lookups to the template instance
 * @author Dominik Ferber
 * @copyright 2016 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

const getPropertyName = require('../util/ast/getPropertyName');

const jQueryNames = new Set(['$', 'jQuery']);

const relevantTemplatePropertyNames = new Set([
  'onRendered',
  'onDestroyed',
  'events',
  'helpers',
]);

const isJQueryIdentifier = (node) =>
  node.type === 'Identifier' && jQueryNames.has(node.name);

const isRelevantTemplateCallExpression = (node) =>
  node.type === 'CallExpression' &&
  node.callee.type === 'MemberExpression' &&
  node.callee.object.type === 'MemberExpression' &&
  node.callee.object.object.type === 'Identifier' &&
  node.callee.object.object.name === 'Template' &&
  relevantTemplatePropertyNames.has(getPropertyName(node.callee.property));

const isInRelevantTemplateScope = (ancestors) =>
  ancestors.some(isRelevantTemplateCallExpression);

module.exports = {
  meta: {
    schema: [],
  },
  create: (context) => ({
    CallExpression: (node) => {
      if (!isJQueryIdentifier(node.callee)) return;
      if (!isInRelevantTemplateScope(context.getAncestors())) return;
      context.report(node, 'Use scoped DOM lookup instead');
    },
  }),
};
