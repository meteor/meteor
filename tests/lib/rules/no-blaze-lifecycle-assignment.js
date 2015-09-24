/**
 * @fileoverview Prevent usage of deprecated template callback assignments.
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */
'use strict';

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

var rule = require('../../../lib/rules/no-blaze-lifecycle-assignment'),

  RuleTester = require('eslint').RuleTester;


// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

var ruleTester = new RuleTester();
ruleTester.run('no-blaze-lifecycle-assignment', rule, {

  valid: [
    'x += 1',
    'Template = true',
    'Template.foo.bar = true',
    'Template.foo.onCreated(function () {})',
    'Template.foo.onRendered(function () {})',
    'Template.foo.onDestroyed(function () {})'
  ],

  invalid: [
    {
      code: 'Template.foo.created = function () {}',
      errors: [{
        message: 'Template callback assignment with `created` is deprecated. Use `onCreated` instead',
        type: 'AssignmentExpression'
      }]
    },
    {
      code: 'Template.foo.rendered = function () {}',
      errors: [{
        message: 'Template callback assignment with `rendered` is deprecated. Use `onRendered` instead',
        type: 'AssignmentExpression'
      }]
    },
    {
      code: 'Template.foo.destroyed = function () {}',
      errors: [{
        message: 'Template callback assignment with `destroyed` is deprecated. Use `onDestroyed` instead',
        type: 'AssignmentExpression'
      }]
    },
    {
      code: 'Template["foo"].created = function () {}',
      errors: [{
        message: 'Template callback assignment with `created` is deprecated. Use `onCreated` instead',
        type: 'AssignmentExpression'
      }]
    },
    {
      code: 'Template["foo"].rendered = function () {}',
      errors: [{
        message: 'Template callback assignment with `rendered` is deprecated. Use `onRendered` instead',
        type: 'AssignmentExpression'
      }]
    },
    {
      code: 'Template["foo"].destroyed = function () {}',
      errors: [{
        message: 'Template callback assignment with `destroyed` is deprecated. Use `onDestroyed` instead',
        type: 'AssignmentExpression'
      }]
    }
  ]
});
