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
// Environments
// -----------------------------------------------------------------------------

const serverEnv = {
  path: 'server/pubsub.js',
  env: SERVER,
  isCompatibilityFile: false,
  isInMeteorProject: true,
  isPackageConfig: false,
  isMobileConfig: false
}

const clientEnv = {
  path: 'server/pubsub.js',
  env: CLIENT,
  isCompatibilityFile: false,
  isInMeteorProject: true,
  isPackageConfig: false,
  isMobileConfig: false
}

const universalEnv = {
  path: 'pubsub.js',
  env: UNIVERSAL,
  isCompatibilityFile: false,
  isInMeteorProject: true,
  isPackageConfig: false,
  isMobileConfig: false
}

const notInMeteorProject = {
  isInMeteorProject: false
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------


const ruleTester = new RuleTester()
ruleTester.run('pubsub', rule(() => serverEnv), {
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

ruleTester.run('pubsub', rule(() => clientEnv), {
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

ruleTester.run('pubsub', rule(() => universalEnv), {
  valid: [
    'if (Meteor.isClient) { Meteor.subscribe("foo") }',
    'if (Meteor.isServer) { Meteor.publish("foo", function () {}) }'
  ],

  invalid: [
    {
      code: 'Meteor.subscribe("foo")',
      errors: [
        {message: 'Allowed on client only', type: 'CallExpression'}
      ]
    },
    {
      code: `
        if (Meteor.isClient) {
          if (Meteor.isServer) {
            Meteor.publish("foo", function () {})
            Meteor.subscribe("foo")
          }
        }
      `,
      errors: [
        {message: 'Allowed on server only', type: 'CallExpression'},
        {message: 'Allowed on client only', type: 'CallExpression'}
      ]
    },
    {
      code: `
        if (Meteor.isServer) {
          if (Meteor.isClient) {
            Meteor.publish("foo", function () {})
            Meteor.subscribe("foo")
          }
        }
      `,
      errors: [
        {message: 'Allowed on server only', type: 'CallExpression'},
        {message: 'Allowed on client only', type: 'CallExpression'}
      ]
    }
  ]
})

ruleTester.run('pubsub', rule(() => notInMeteorProject), {
  valid: [
    'foo()'
  ],
  invalid: []
})
