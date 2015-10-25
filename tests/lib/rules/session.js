/**
 * @fileoverview Core API for Session
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

import {NON_METEOR, UNIVERSAL, CLIENT, SERVER} from '../../../dist/util/environment'
const rule = require('../../../dist/rules/session')
const RuleTester = require('eslint').RuleTester

const commonValidCode = [
  'x()',
  'Session.set("foo", true)',
  'Session.setDefault("foo", true)',
  'Session.get("foo")',
  'Session.equals("foo", true)',
  {
    code: `Session.equal('foo', 'bar')`,
    options: ['equal']
  },
  `
    if (Meteor.isServer) {
      Session.set('foo')
    }
  `
]

const commonInvalidCode = [
  {
    code: `Session.set('foo')`,
    errors: [{message: 'Expected two arguments', type: 'CallExpression'}]
  },
  {
    code: `Session.setDefault('foo')`,
    errors: [{message: 'Expected two arguments', type: 'CallExpression'}]
  },
  {
    code: `Session.set('foo', true, 'bar')`,
    errors: [{message: 'Expected two arguments', type: 'CallExpression'}]
  },
  {
    code: `
      Session.get('foo', true)
    `,
    errors: [{message: 'Expected one argument', type: 'CallExpression'}]
  },
  {
    code: `Session.get()`,
    errors: [{message: 'Expected one argument', type: 'CallExpression'}]
  },
  {
    code: `Session.equals('foo')`,
    errors: [{message: 'Expected two arguments', type: 'CallExpression'}]
  },
  {
    code: `Session.equal('foo', 'bar')`,
    options: ['no-equal'],
    errors: [{message: 'Did you mean "Session.equals" instead?', type: 'Identifier'}]
  }
]

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester()

ruleTester.run('session', rule(() => ({env: CLIENT})), {
  valid: [
    ...commonValidCode
  ],

  invalid: [
    ...commonInvalidCode
  ]
})

ruleTester.run('session', rule(() => ({env: UNIVERSAL})), {
  valid: [
    `
      if (Meteor.isClient) {
        Session.set('foo', true)
      }
    `,
    `
      if (Meteor.isCordova) {
        Session.set('foo', true)
      }
    `
  ],

  invalid: [
    {
      code: `Session.set('foo', true)`,
      errors: [{message: 'Allowed on client only', type: 'CallExpression'}]
    }
  ]
})

ruleTester.run('session', rule(() => ({env: SERVER})), {
  valid: [
    ...commonValidCode,
    ...commonInvalidCode
  ],

  invalid: []
})

ruleTester.run('session', rule(() => ({env: NON_METEOR})), {
  valid: [
    ...commonValidCode,
    ...commonInvalidCode
  ],

  invalid: []
})
