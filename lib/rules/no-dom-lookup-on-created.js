/**
 * @fileoverview Forbid DOM lookup in template creation callback
 * @author Dominik Ferber
 * @copyright 2016 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

const getPropertyName = require('../util/ast/getPropertyName');

const errorMessage =
  'Accessing DOM from "onCreated" is forbidden. Try from "onRendered" instead.';
const jQueryNames = new Set(['$', 'jQuery']);

const isJQueryCallee = node =>
  // $()
  (node.type === 'Identifier' && jQueryNames.has(node.name)) || // Template.instance().$()
  (node.type === 'MemberExpression' &&
    node.property.type === 'Identifier' &&
    node.property.name === '$' &&
    node.object.type === 'CallExpression' &&
    node.object.callee.type === 'MemberExpression' &&
    node.object.callee.object.type === 'Identifier' &&
    node.object.callee.object.name === 'Template' &&
    getPropertyName(node.object.callee.property) === 'instance');

const isRelevantTemplateCallExpression = node =>
  node.type === 'CallExpression' &&
  node.callee.type === 'MemberExpression' &&
  node.callee.object.type === 'MemberExpression' &&
  node.callee.object.object.type === 'Identifier' &&
  node.callee.object.object.name === 'Template' &&
  getPropertyName(node.callee.property) === 'onCreated';

const isInRelevantTemplateScope = ancestors =>
  ancestors.some(isRelevantTemplateCallExpression);

module.exports = {
  meta: {
    schema: [],
  },
  create: context => ({
    CallExpression: node => {
      if (!isJQueryCallee(node.callee)) return;
      if (!isInRelevantTemplateScope(context.getAncestors())) return;

      context.report(node, errorMessage);
    },
  }),
};
