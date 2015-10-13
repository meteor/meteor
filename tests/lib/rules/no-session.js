/**
 * @fileoverview Prevent usage of Session
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

const rule = require('../../../dist/rules/no-session')
const RuleTester = require('eslint').RuleTester

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------


const ruleTester = new RuleTester()
ruleTester.run('no-session', rule(() => ({isLintedEnv: true})), {

  valid: [
    'session.get("foo")',
    'foo(Session)'
  ],

  invalid: [
    {code: 'Session.set("foo", true)', errors: [{message: 'Unexpected Session statement', type: 'MemberExpression'}]},
    {code: 'Session.get("foo")', errors: [{message: 'Unexpected Session statement', type: 'MemberExpression'}]},
    {code: 'Session.clear("foo")', errors: [{message: 'Unexpected Session statement', type: 'MemberExpression'}]},
    {code: 'Session.all()', errors: [{message: 'Unexpected Session statement', type: 'MemberExpression'}]}
  ]

})
ruleTester.run('no-session', rule(() => ({isLintedEnv: false})), {
  valid: [
    'Session.set("foo", true)',
    'Session.get("foo")'
  ],
  invalid: []
})
