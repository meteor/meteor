/**
 * @fileoverview Prevent usage of Meteor.setTimeout with zero delay
 * @author Dominik Ferber
 */
'use strict';

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = function (context) {

  // -------------------------------------------------------------------------
  // Public
  // -------------------------------------------------------------------------

  return {

    CallExpression: function (node) {
      if (node.callee.type === 'MemberExpression') {
        if (
          node.callee.object.type === 'Identifier' && node.callee.object.name === 'Meteor' &&
          (
            (node.callee.property.type === 'Identifier' && node.callee.property.name === 'setTimeout') ||
            (node.callee.property.type === 'Literal' && node.callee.property.value === 'setTimeout')
          )
        ) {
          if (node.arguments.length === 1) {
            context.report(node, 'Implicit timeout of 0');
          } else if (
            node.arguments.length > 1 && node.arguments[1].type === 'Literal' && node.arguments[1].value === 0
          ) {
            context.report(node, 'Timeout of 0. Use `Meteor.defer` instead');
          }
        }
      }
    }

  };

};

module.exports.schema = [];
