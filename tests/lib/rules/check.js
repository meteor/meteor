/**
 * @fileoverview Core API for check and Match
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

import {CLIENT, SERVER, UNIVERSAL, NON_METEOR} from '../../../dist/util/environment'
const rule = require('../../../dist/rules/check')
const RuleTester = require('eslint').RuleTester


const commonValidCode = [
  `
    if (Meteor.isClient && Meteor.isServer) {
      check()
    }
  `,
  `
    if (Meteor.isClient && Meteor.isServer) {
      check = true
    }
  `,
  `
    if (Meteor.isClient && Meteor.isServer) {
      check++
    }
  `,
  `
    if (Meteor.isClient && Meteor.isServer) {
      Match.test()
    }
  `,
  'Match.test',
  'Match["test"]',
  'Foo.bar',
  'Match["test"]()',

  'check(foo, String)',
  `
    check(message, {
      text: String,
      timestamp: Date,
      tags: Match.Optional([String])
    })
  `,

  'Match.test("Foo", Match.Any)',
  'Match.test(foo, Match.String)',
  'Match.test(foo, String)',
  `
    Match.test(message, {
      text: String,
      timestamp: Date,
      tags: Match.Optional([String])
    })
  `,

  'check(foo, Match.Any)',
  'check(foo, Match.String)',
  'check(foo, Match.Integer)',
  'check(foo, [Number])',
  'check(foo, String)',
  'check(foo, Number)',
  'check(foo, Object)',
  'check(foo, Boolean)',
  'check(foo, undefined)',
  'check(foo, null)',
  'check(foo, {bar: Date, baz: Number})',
  'check(foo, Bar)',
  'check(foo, Match.ObjectIncluding({key1: pattern1, key2: pattern2}))',
  'check(foo, Match.ObjectIncluding({}))',
  'check(foo, Match.Optional({}))',
  'check(foo, Match.OneOf(pattern1, pattern2))',
  'check(foo, Match.Where(EJSON.isBinary))'
]

const commonInvalidCode = [
  {
    code: 'check()',
    errors: [{message: 'Two arguments expected', type: 'CallExpression'}]
  },
  {
    code: 'check(foo, bar, baz)',
    errors: [{message: 'Two arguments expected', type: 'CallExpression'}]
  },
  {
    code: 'check = true',
    errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]
  },
  {
    code: 'check++',
    errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]
  },

  {
    code: 'Match.test()',
    errors: [{message: 'Two arguments expected', type: 'CallExpression'}]
  },
  {
    code: 'Match.test(foo, bar, baz)',
    errors: [{message: 'Two arguments expected', type: 'CallExpression'}]
  },
  {
    code: 'Match.test = true',
    errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]
  },
  {
    code: 'Match.test++',
    errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]
  },

  {
    code: 'Match.Any = true',
    errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]
  },
  {
    code: 'Match.Any++',
    errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]
  },
  {
    code: 'Match.Any()',
    errors: [{message: 'Not a function', type: 'CallExpression'}]
  },

  {
    code: 'Match.Integer = true',
    errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]
  },
  {
    code: 'Match.Integer++',
    errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]
  },
  {
    code: 'Match.Integer()',
    errors: [{message: 'Not a function', type: 'CallExpression'}]
  },

  {
    code: 'Match.ObjectIncluding = true',
    errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]
  },
  {
    code: 'Match.ObjectIncluding++',
    errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]
  },
  {
    code: 'Match.ObjectIncluding()',
    errors: [{message: 'Expected one argument', type: 'CallExpression'}]
  },

  {
    code: 'Match.Optional = true',
    errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]
  },
  {
    code: 'Match.Optional++',
    errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]
  },
  {
    code: 'Match.Optional()',
    errors: [{message: 'Expected one argument', type: 'CallExpression'}]
  },

  {
    code: 'Match.OneOf = true',
    errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]
  },
  {
    code: 'Match.OneOf++',
    errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]
  },
  {
    code: 'Match.OneOf()',
    errors: [{message: 'At least two arguments expected', type: 'CallExpression'}]
  },
  {
    code: 'Match.OneOf(foo)',
    errors: [{message: 'At least two arguments expected', type: 'CallExpression'}]
  },

  {
    code: 'Match.Where = true',
    errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]
  },
  {
    code: 'Match.Where++',
    errors: [{message: 'Update not allowed', type: 'UpdateExpression'}]
  },
  {
    code: 'Match.Where()',
    errors: [{message: 'Expected one argument', type: 'CallExpression'}]
  }
]


// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester()
ruleTester.run('check', rule(() => ({env: SERVER})), {

  valid: [
    ...commonValidCode
  ],

  invalid: [
    ...commonInvalidCode
  ]

})

ruleTester.run('check', rule(() => ({env: CLIENT})), {

  valid: [
    ...commonValidCode
  ],

  invalid: [
    ...commonInvalidCode
  ]

})

ruleTester.run('check', rule(() => ({env: UNIVERSAL})), {

  valid: [
    ...commonValidCode
  ],

  invalid: [
    ...commonInvalidCode
  ]

})

ruleTester.run('check', rule(() => ({env: NON_METEOR})), {
  valid: [
    ...commonValidCode,
    ...commonInvalidCode
  ],
  invalid: []
})
