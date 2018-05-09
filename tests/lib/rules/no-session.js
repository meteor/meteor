/**
 * @fileoverview Prevent usage of Session
 * @author Dominik Ferber
 * @copyright 2016 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

const { RuleTester } = require('eslint');
const rule = require('../../../lib/rules/no-session');

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester();
ruleTester.run('no-session', rule, {
  valid: ['session.get("foo")', 'foo(Session)'],

  invalid: [
    {
      code: `
        if (Meteor.isCordova) {
          Session.set("foo", true)
        }
      `,
      errors: [
        { message: 'Unexpected Session statement', type: 'MemberExpression' },
      ],
    },
    {
      code: 'Session.set("foo", true)',
      errors: [
        { message: 'Unexpected Session statement', type: 'MemberExpression' },
      ],
    },
    {
      code: 'Session.get("foo")',
      errors: [
        { message: 'Unexpected Session statement', type: 'MemberExpression' },
      ],
    },
    {
      code: 'Session.clear("foo")',
      errors: [
        { message: 'Unexpected Session statement', type: 'MemberExpression' },
      ],
    },
    {
      code: 'Session.all()',
      errors: [
        { message: 'Unexpected Session statement', type: 'MemberExpression' },
      ],
    },
  ],
});
