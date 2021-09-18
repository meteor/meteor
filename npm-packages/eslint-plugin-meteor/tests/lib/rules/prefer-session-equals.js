/**
 * @fileoverview Prefer Session.equals in conditions
 * @author Dominik Ferber
 * @copyright 2016 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

const { RuleTester } = require('eslint');
const rule = require('../../../lib/rules/prefer-session-equals');

const ruleTester = new RuleTester();

ruleTester.run('prefer-session-equals', rule, {
  valid: [
    'var x = 1',
    'if(x()) {}',
    'if (true) {}',
    'if (Session["equals"]("foo", true)) {}',
    'if (Session.equals("foo", true)) {}',
    'if (Session.equals("foo", false)) {}',
    'if (Session.equals("foo", 1)) {}',
    'if (Session.equals("foo", "hello")) {}',
    'if (!Session.equals("foo", "hello")) {}',
    'if (_.isEqual(Session.get("foo"), otherValue)) {}',
    'Session.equals("foo", true) ? true : false',
    'if (Session.set("foo")) {}',
  ],

  invalid: [
    {
      code: 'if (Session.get("foo")) {}',
      errors: [
        { message: 'Use "Session.equals" instead', type: 'MemberExpression' },
      ],
    },
    {
      code: 'if (Session.get("foo") == 3) {}',
      errors: [
        { message: 'Use "Session.equals" instead', type: 'MemberExpression' },
      ],
    },
    {
      code: 'if (Session.get("foo") === 3) {}',
      errors: [
        { message: 'Use "Session.equals" instead', type: 'MemberExpression' },
      ],
    },
    {
      code: 'if (Session.get("foo") === bar) {}',
      errors: [
        { message: 'Use "Session.equals" instead', type: 'MemberExpression' },
      ],
    },
    {
      code: 'if (Session.get("foo") !== bar) {}',
      errors: [
        { message: 'Use "Session.equals" instead', type: 'MemberExpression' },
      ],
    },
    {
      code: 'Session.get("foo") ? true : false',
      errors: [
        { message: 'Use "Session.equals" instead', type: 'MemberExpression' },
      ],
    },
    {
      code: 'Session.get("foo") && false ? true : false',
      errors: [
        { message: 'Use "Session.equals" instead', type: 'MemberExpression' },
      ],
    },
    {
      code: 'Session.get("foo") === 2 ? true : false',
      errors: [
        { message: 'Use "Session.equals" instead', type: 'MemberExpression' },
      ],
    },
    {
      code: 'true || Session.get("foo") === 2 ? true : false',
      errors: [
        { message: 'Use "Session.equals" instead', type: 'MemberExpression' },
      ],
    },
  ],
});
