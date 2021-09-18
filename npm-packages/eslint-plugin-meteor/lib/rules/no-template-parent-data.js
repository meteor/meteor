/**
 * @fileoverview Avoid accessing template parent data
 * @author Dominik Ferber
 * @copyright 2016 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

module.exports = {
  meta: {
    schema: [],
  },
  create: (context) => ({
    CallExpression: (node) => {
      if (
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'Template' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'parentData'
      ) {
        context.report(node, 'Forbidden. Pass data explicitly instead');
      }
    },
  }),
};
