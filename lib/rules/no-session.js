/**
 * @fileoverview Prevent usage of Session
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

    MemberExpression: function (node) {
      if (node.object.name === 'Session') {
        context.report(node, 'Unexpected Session statement.');
      }
    }

  };

};

module.exports.schema = [];
