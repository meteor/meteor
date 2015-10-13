/**
 * @fileoverview Meteor Core API
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

const rule = require('../../../dist/rules/core')
const RuleTester = require('eslint').RuleTester


// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------


const tests = {

  valid: [
    'console.log("foo")',
    'Meteor.x = true',

    'var x = Meteor.isClient',
    'var x = Meteor.isServer',
    'var x = Meteor.isCordova',
    'Meteor.startup(function () {})',
    'Meteor.wrapAsync(function () {})',
    'Meteor.absoluteUrl()',
    'var s = Meteor.settings',
    'var r = Meteor.release',

    'Meteor.startup(function () {})',
    'Meteor.startup(foo())', // could be a fn returning a fn
    'Meteor.startup(foo)',
    'Meteor.startup(Foo.bar)',
    'Meteor.startup(Foo.bar())',

    'Meteor.wrapAsync(foo)',
    'Meteor.wrapAsync(foo, bar)',
    'Meteor.wrapAsync(Foo.bar(), Foo.baz())',

    'Meteor.absoluteUrl(foo)',
    'Meteor.absoluteUrl(foo, bar)'
  ],

  invalid: [
    {code: 'Meteor.isClient = true', errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]},
    {code: 'Meteor.isServer = true', errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]},
    {code: 'Meteor.isCordova = true', errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]},
    {code: 'Meteor.startup = true', errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]},
    {code: 'Meteor.wrapAsync = true', errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]},
    {code: 'Meteor.absoluteUrl = true', errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]},
    {code: 'Meteor.settings = true', errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]},
    {code: 'Meteor.release = true', errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]},

    {code: 'Meteor.isClient++', errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]},
    {code: 'Meteor.isServer++', errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]},
    {code: 'Meteor.isCordova++', errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]},
    {code: 'Meteor.startup++', errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]},
    {code: 'Meteor.wrapAsync++', errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]},
    {code: 'Meteor.absoluteUrl++', errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]},
    {code: 'Meteor.settings++', errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]},
    {code: 'Meteor.release++', errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]},

    {code: 'Meteor.startup()', errors: [{message: 'Expected one argument', type: 'CallExpression'}]},
    {code: 'Meteor.startup(x, y)', errors: [{message: 'Expected one argument only', type: 'CallExpression'}]},

    {code: 'Meteor.wrapAsync()', errors: [{message: 'Expected at least one argument', type: 'CallExpression'}]},
    {
      code: 'Meteor.wrapAsync(x, y, z)',
      errors: [{message: 'Expected no more than two arguments', type: 'CallExpression'}]
    },

    {
      code: 'Meteor.absoluteUrl(x, y, z)',
      errors: [{message: 'Expected no more than two arguments', type: 'CallExpression'}]
    }
  ]

}

const errorFreeTests = {
  valid: [
    'Meteor.isClient',
    'Meteor.isServer',
    'Meteor.isCordova',
    'Meteor.startup(function () {})',
    'Meteor.wrapAsync(function () {})',
    'Meteor.absoluteUrl()',
    'Meteor.settings',
    'Meteor.release',

    'Meteor.isClient = true',
    'Meteor.isServer = true',
    'Meteor.isCordova = true',
    'Meteor.startup = true',
    'Meteor.wrapAsync = true',
    'Meteor.absoluteUrl = true',
    'Meteor.settings = true',
    'Meteor.release = true',

    'Meteor.isClient++',
    'Meteor.isServer++',
    'Meteor.isCordova++',
    'Meteor.startup++',
    'Meteor.wrapAsync++',
    'Meteor.absoluteUrl++',
    'Meteor.settings++',
    'Meteor.release++'
  ],

  invalid: []
}

const ruleTester = new RuleTester()
ruleTester.run('core', rule(() => ({isLintedEnv: true})), tests)
ruleTester.run('core', rule(() => ({isLintedEnv: false})), errorFreeTests)
