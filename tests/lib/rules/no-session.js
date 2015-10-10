/**
 * @fileoverview Prevent usage of Session
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

import {SERVER, CLIENT} from '../../../dist/util/environment.js'
const rule = require('../../../dist/rules/no-session')
const RuleTester = require('eslint').RuleTester


// -----------------------------------------------------------------------------
// Environments
// -----------------------------------------------------------------------------

const serverEnv = {
  path: 'server/methods.js',
  env: SERVER,
  isCompatibilityFile: false,
  isInMeteorProject: true
}

const clientEnv = {
  path: 'client/methods.js',
  env: CLIENT,
  isCompatibilityFile: false,
  isInMeteorProject: true
}


// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------


const ruleTester = new RuleTester()
ruleTester.run('no-session', rule(() => serverEnv), {

  valid: [
    'session.get("foo")',
    'foo(Session)'
  ],

  invalid: [
    {code: 'Session.set("foo", true)', errors: [{message: 'Unexpected Session statement.', type: 'MemberExpression'}]},
    {code: 'Session.get("foo")', errors: [{message: 'Unexpected Session statement.', type: 'MemberExpression'}]},
    {code: 'Session.clear("foo")', errors: [{message: 'Unexpected Session statement.', type: 'MemberExpression'}]},
    {code: 'Session.all()', errors: [{message: 'Unexpected Session statement.', type: 'MemberExpression'}]}
  ]

})

ruleTester.run('no-session', rule(() => clientEnv), {

  valid: [
    'session.get("foo")',
    'foo(Session)'
  ],

  invalid: [
    {code: 'Session.set("foo", true)', errors: [{message: 'Unexpected Session statement.', type: 'MemberExpression'}]},
    {code: 'Session.get("foo")', errors: [{message: 'Unexpected Session statement.', type: 'MemberExpression'}]},
    {code: 'Session.clear("foo")', errors: [{message: 'Unexpected Session statement.', type: 'MemberExpression'}]},
    {code: 'Session.all()', errors: [{message: 'Unexpected Session statement.', type: 'MemberExpression'}]}
  ]

})
