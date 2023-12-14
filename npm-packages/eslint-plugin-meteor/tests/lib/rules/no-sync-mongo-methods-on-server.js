/**
 * @fileoverview This rule checks the usage of syncronous MongoDB Methods on the Server which will stop working starting from Meteor 3.0 with the fiber removal
 * @author Renan Castro
 * @copyright 2016 Renan Castro. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

const { RuleTester } = require('eslint');
const rule = require('../../../lib/rules/no-sync-mongo-methods-on-server/no-sync-mongo-methods-on-server');

const ruleTester = new RuleTester();

ruleTester.run('no-sync-mongo-methods-on-server', rule, {
  only: true,
  valid: [
    // give me some valid tests
    { code: 'TestCollection.findOneAsync()' },
  ],

  invalid: [
    {
      code: 'TestCollection.findOne()',
      errors: [
        { message: 'Should use Meteor async calls', type: 'CallExpression' },
      ],
    },
  ],
});
