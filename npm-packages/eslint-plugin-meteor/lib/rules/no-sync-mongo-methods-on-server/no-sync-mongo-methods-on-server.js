/**
 * @fileoverview This rule checks the usage of syncronous MongoDB Methods on the Server which will stop working starting from Meteor 3.0 with the fiber removal
 * @author Renan Castro
 * @copyright 2016 Renan Castro. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

const fs = require('fs');
const { Walker } = require('./helpers');
const cachedParsedFile = new Map();
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Detect sync Meteor calls',
      recommended: true,
    },
    fixable: 'code',
  },
  create: (context) => {
    // ---------------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------------

    const invalidFunctionNames = [
      'findOne',
      'insert',
      'update',
      'upsert',
      'remove',
      'createIndex',
      'fetch',
      'count',
    ];
    function createError(context, node) {
      const error = {
        node: node.parent,
        message: 'Should use Meteor async calls',
      };
      context.report(error);
    }

    // ---------------------------------------------------------------------------
    // Public
    // ---------------------------------------------------------------------------

    return {
      Program: function () {
        new Walker(context.cwd).walkApp(['server'], ({ path }) => {
          // console.log(`Processing file ${path}`);
        });
      },
      MemberExpression: function (node) {
        const walker = new Walker(context.cwd);
        const realPath = fs.realpathSync.native(context.physicalFilename);
        console.log(
          'Checking if should evaluate realPath',
          realPath,
          context.physicalFilename,
          walker.cachedParsedFile
        );
        if (
          !Object.keys(walker.cachedParsedFile).length ||
          (!realPath) in walker.cachedParsedFile
        ) {
          return;
        }
        // console.log('Found a server file!!');
        if (node.property && node.property.type === 'Identifier') {
          // checks if we are inside the server
          // console.log(context.sourceCode.getAncestors(node));

          // context.sourceCode.getAncestors(node);
          if (invalidFunctionNames.includes(node.property.name)) {
            createError(context, node);
          }
        }
      },
    };
  },
};
