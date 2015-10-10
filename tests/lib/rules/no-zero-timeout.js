/**
 * @fileoverview Prevent usage of Meteor.setTimeout with zero delay
 * @author Dominik Ferber
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

const rule = require('../../../dist/rules/no-zero-timeout')
const RuleTester = require('eslint').RuleTester


// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester()
ruleTester.run('no-zero-timeout', rule(), {

  valid: [
    'Meteor.setTimeout()',
    'Meteor.setTimeout(function () {}, 1)',
    'Meteor.setTimeout(foo, 1)',
    'Meteor.defer(foo, 0)',
    'Meteor["setTimeout"](function () {}, 1)',
    'Meteor["setInterval"](function () {}, 1)',
    'foo()'
  ],

  invalid: [
    {
      code: 'Meteor.setTimeout(function () {}, 0)',
      errors: [{
        message: 'Timeout of 0. Use `Meteor.defer` instead',
        type: 'CallExpression'
      }]
    },
    {
      code: 'Meteor["setTimeout"](function () {}, 0)',
      errors: [{
        message: 'Timeout of 0. Use `Meteor.defer` instead',
        type: 'CallExpression'
      }]
    },
    {
      code: 'Meteor.setTimeout(foo, 0)',
      errors: [{
        message: 'Timeout of 0. Use `Meteor.defer` instead',
        type: 'CallExpression'
      }]
    },
    {
      code: 'Meteor.setTimeout(function () {})',
      errors: [{
        message: 'Implicit timeout of 0',
        type: 'CallExpression'
      }]
    },
    {
      code: 'Meteor.setTimeout(foo)',
      errors: [{
        message: 'Implicit timeout of 0',
        type: 'CallExpression'
      }]
    }
  ]
})
