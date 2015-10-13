/**
 * @fileoverview Core API for publications and subscriptions
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

import {CLIENT, SERVER, UNIVERSAL} from '../../../dist/util/environment.js'
const rule = require('../../../dist/rules/pubsub')
const RuleTester = require('eslint').RuleTester

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester()
ruleTester.run('pubsub', rule(() => ({env: SERVER, isLintedEnv: true})), {
  valid: [
    'Meteor.publish("foo", function () {})'
  ],

  invalid: [
    {
      code: 'Meteor.publish()',
      errors: [
        {message: 'Two arguments expected', type: 'CallExpression'}
      ]
    },
    {
      code: 'Meteor.subscribe("foo")',
      errors: [
        {message: 'Allowed on client only', type: 'CallExpression'}
      ]
    }
  ]
})

ruleTester.run('pubsub', rule(() => ({env: CLIENT, isLintedEnv: true})), {
  valid: [
    'Meteor.subscribe("foo")'
  ],

  invalid: [
    {
      code: 'Meteor.publish()',
      errors: [
        {message: 'Allowed on server only', type: 'CallExpression'}
      ]
    },
    {
      code: 'Meteor.subscribe()',
      errors: [
        {message: 'At least one argument expected', type: 'CallExpression'}
      ]
    }
  ]
})

ruleTester.run('pubsub', rule(() => ({env: UNIVERSAL, isLintedEnv: true})), {
  valid: [
    'if (Meteor.isClient) { Meteor.subscribe("foo") }',
    'if (Meteor.isServer) { Meteor.publish("foo", function () {}) }',
    `
      if (Meteor.isClient) {
        if (Meteor.isServer) {

          // valid because it is unreachable
          Meteor.publish("foo", function () {})
          Meteor.subscribe("foo")
        }
      }
    `
  ],

  invalid: [
    {
      code: 'Meteor.subscribe("foo")',
      errors: [
        {message: 'Allowed on client only', type: 'CallExpression'}
      ]
    }
  ]
})

ruleTester.run('pubsub', rule(() => ({isLintedEnv: false})), {
  valid: [
    'foo()'
  ],
  invalid: []
})
