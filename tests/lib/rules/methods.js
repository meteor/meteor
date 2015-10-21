/**
 * @fileoverview Core API for methods
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

import {UNIVERSAL, SERVER, NON_METEOR} from '../../../dist/util/environment'
const rule = require('../../../dist/rules/methods')
const RuleTester = require('eslint').RuleTester

const commonValidCode = [
  'new Meteor.foo()',
  'Meteor.call("foo")',
  'Meteor.call("foo", true)',
  'Meteor.apply("foo", [], function () {})',
  `
    Meteor.methods({
      foo: function () {
        return this.userId
      }
    })
  `,
  `
    Meteor.methods({
      foo: function () {
        var self = this
        return self.userId
      }
    })
  `,
  `
    Meteor.methods({
      foo: function () {
        return this.isSimulation
      }
    })
  `,
  `
    Meteor.methods({
      foo: function () {
        return this.connection
      }
    })
  `
]

const commonInvalidCode = [
  {code: 'Meteor.methods()', errors: [{message: 'Expected one argument', type: 'CallExpression'}]},
  {code: 'Meteor.call()', errors: [{message: 'At least one argument expected', type: 'CallExpression'}]},
  {code: 'Meteor.apply()', errors: [{message: 'At least two arguments expected', type: 'CallExpression'}]},
  {code: 'Meteor.Error()', errors: [{message: 'Missing "new" keyword', type: 'CallExpression'}]},
  {code: 'new Meteor.Error()', errors: [{message: 'At least one argument expected', type: 'NewExpression'}]},
  {code: 'new Meteor.Error(1)', errors: [{message: 'Expected a string', type: 'Literal'}]},
  {
    code: `
      Meteor.methods({
        foo: function () {
          this.userId++
        }
      })
    `,
    errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]
  },
  {
    code: `
      Meteor.methods({
        foo: function () {
          this.userId = '4'
        }
      })
    `,
    errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]
  },
  {
    code: `
      Meteor.methods({
        foo: function () {
          this.userId()
        }
      })
    `,
    errors: [{message: 'Not a function', type: 'CallExpression'}]
  }
]

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester()
ruleTester.run('methods', rule(() => ({env: SERVER})), {

  valid: [
    ...commonValidCode,
    `
      Meteor.methods({
        foo: function () {
          this.setUserId('5')
        }
      })
    `,
    `
      Meteor.methods({
        foo: function () {
          this.unblock()
        }
      })
    `,
    `
      if (Meteor.isClient) {
        new Meteor.Error()
      }
    `,
    `
      if (Meteor.isClient) {
        Meteor.methods()
      }
    `,
    `
      Meteor.methods({
        foo: function () {
          if (Meteor.isClient) {
            return this.userId
          }
        }
      })
    `
  ],

  invalid: commonInvalidCode

})

ruleTester.run('methods', rule(() => ({env: UNIVERSAL})), {

  valid: [
    ...commonValidCode,
    `new Meteor.Error('foo')`,
    `
      Meteor.methods({
        foo: function () {
          if (Meteor.isClient && Meteor.isServer) {
            this.setUserId()
          }
        }
      })
    `,
    `
      Meteor.foo({
        bar: function () {
          this.setUserId()
        }
      })
    `,
    `
      Meteor.foo({
        bar: function () {
          var self = this
          self.setUserId()
        }
      })
    `
  ],

  invalid: [
    ...commonInvalidCode,
    {
      code: `
        Meteor.methods({
          foo: function () {
            this.setUserId('5')
          }
        })
      `,
      errors: [{message: 'Allowed on server only', type: 'CallExpression'}]
    },
    {
      code: `
        Meteor.methods({
          foo: function () {
            if (Meteor.isServer) {
              this.setUserId()
            }
          }
        })
      `,
      errors: [{message: 'Expected one argument', type: 'CallExpression'}]
    }
  ]

})

ruleTester.run('methods', rule(() => ({env: NON_METEOR})), {
  valid: [
    ...commonValidCode,
    ...commonInvalidCode
  ],
  invalid: []
})
