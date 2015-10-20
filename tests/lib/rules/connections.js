/**
 * @fileoverview Core API for connections
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

const rule = require('../../../dist/rules/connections')
const RuleTester = require('eslint').RuleTester
import {CLIENT, SERVER, UNIVERSAL, NON_METEOR} from '../../../dist/util/environment'

const commonValidCode = [
  'DDP.connect(url)',
  'DDP.connect("http://localhost")'
]

const commonInvalidCode = [
  {
    code: 'DDP.connect()',
    errors: [{message: 'Expected one argument', type: 'CallExpression'}]
  }
]

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester()
ruleTester.run('connections', rule(() => ({env: SERVER})), {

  valid: [
    ...commonValidCode,
    'Meteor.foo = true',
    'Meteor.foo()',
    'Meteor.onConnection(foo)',
    'Meteor.onConnection(function () {})',
    {
      code: 'Meteor.onConnection(() => {})',
      parser: 'babel-eslint'
    },
    {
      code: `
        if (Meteor.isClient && Meteor.isServer) {
          Meteor.status = true
        }
      `
    }
  ],

  invalid: [
    ...commonInvalidCode,
    {
      code: 'Meteor.status()',
      errors: [
        {message: 'Allowed on client only', type: 'CallExpression'}
      ]
    },
    {
      code: 'Meteor.reconnect()',
      errors: [
        {message: 'Allowed on client only', type: 'CallExpression'}
      ]
    },
    {
      code: 'Meteor.disconnect()',
      errors: [
        {message: 'Allowed on client only', type: 'CallExpression'}
      ]
    },
    {
      code: 'Meteor.onConnection()',
      errors: [
        {message: 'Expected one argument', type: 'CallExpression'}
      ]
    },
    {
      code: 'Meteor.onConnection = true',
      errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]
    }
  ]

})

ruleTester.run('connections', rule(() => ({env: CLIENT})), {

  valid: [
    ...commonValidCode,
    'Meteor.status()'
  ],

  invalid: [
    ...commonInvalidCode,
    {
      code: 'Meteor.status(true)',
      errors: [
        {message: 'Expected no arguments', type: 'CallExpression'}
      ]
    },
    {
      code: 'Meteor.reconnect(true)',
      errors: [
        {message: 'Expected no arguments', type: 'CallExpression'}
      ]
    },
    {
      code: 'Meteor.disconnect(true)',
      errors: [
        {message: 'Expected no arguments', type: 'CallExpression'}
      ]
    },
    {
      code: 'Meteor.onConnection()',
      errors: [
        {message: 'Allowed on server only', type: 'CallExpression'}
      ]
    },
    {
      code: 'Meteor.status = true',
      errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]
    },
    {
      code: 'Meteor.reconnect = true',
      errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]
    },
    {
      code: 'Meteor.disconnect = true',
      errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]
    },
    {
      code: 'DDP.connect = true',
      errors: [{message: 'Assignment not allowed', type: 'AssignmentExpression'}]
    }
  ]

})

ruleTester.run('connections', rule(() => ({env: UNIVERSAL})), {
  valid: [
    ...commonValidCode
  ],

  invalid: [
    ...commonInvalidCode,
    {
      code: 'Meteor.status()',
      errors: [
        {message: 'Allowed on client only', type: 'CallExpression'}
      ]
    },
    {
      code: 'Meteor.reconnect()',
      errors: [
        {message: 'Allowed on client only', type: 'CallExpression'}
      ]
    },
    {
      code: 'Meteor.disconnect()',
      errors: [
        {message: 'Allowed on client only', type: 'CallExpression'}
      ]
    },
    {
      code: 'Meteor.onConnection()',
      errors: [
        {message: 'Allowed on server only', type: 'CallExpression'}
      ]
    }
  ]
})

ruleTester.run('connections', rule(() => ({env: NON_METEOR})), {
  valid: [
    ...commonValidCode,
    ...commonInvalidCode
  ],
  invalid: []
})
