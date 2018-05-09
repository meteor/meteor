/**
 * @fileoverview Force a naming convention for templates
 * @author Dominik Ferber
 * @copyright 2016 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

const { RuleTester } = require('eslint');
const rule = require('../../../lib/rules/template-names');

const ruleTester = new RuleTester();

ruleTester.run('template-names', rule, {
  valid: [
    'Template["foo"].helpers',
    'Template.foo.helpers',
    'Template.foo01.helpers',
    'Template.foo19bar.helpers',
    'Template.fooBar.helpers',
    'Template.fooBar.helpers({})',
    {
      code: 'Template.FooBar.helpers({})',
      options: ['pascal-case'],
    },
    {
      code: 'Template.foo_bar.helpers({})',
      options: ['snake-case'],
    },
    {
      code: 'Template.Foo_bar.helpers({})',
      options: ['upper-snake-case'],
    },
    {
      code: 'Template.fooBar.helpers({})',
      options: ['camel-case'],
    },
    {
      code: 'Template.fooBar.helpers({})',
      options: [],
    },
  ],

  invalid: [
    {
      code: 'Template.foo_bar.onCreated',
      errors: [
        {
          message: 'Invalid template name, expected name to be in camel-case',
          type: 'MemberExpression',
        },
      ],
    },
    {
      code: 'Template.foo_bar.onRendered',
      errors: [
        {
          message: 'Invalid template name, expected name to be in camel-case',
          type: 'MemberExpression',
        },
      ],
    },
    {
      code: 'Template.foo_bar.onDestroyed',
      errors: [
        {
          message: 'Invalid template name, expected name to be in camel-case',
          type: 'MemberExpression',
        },
      ],
    },
    {
      code: 'Template.foo_bar.events',
      errors: [
        {
          message: 'Invalid template name, expected name to be in camel-case',
          type: 'MemberExpression',
        },
      ],
    },
    {
      code: 'Template.foo_bar.helpers',
      errors: [
        {
          message: 'Invalid template name, expected name to be in camel-case',
          type: 'MemberExpression',
        },
      ],
    },
    {
      code: 'Template.foo_bar.created',
      errors: [
        {
          message: 'Invalid template name, expected name to be in camel-case',
          type: 'MemberExpression',
        },
      ],
    },
    {
      code: 'Template.foo_bar.rendered',
      errors: [
        {
          message: 'Invalid template name, expected name to be in camel-case',
          type: 'MemberExpression',
        },
      ],
    },
    {
      code: 'Template.foo_bar.destroyed',
      errors: [
        {
          message: 'Invalid template name, expected name to be in camel-case',
          type: 'MemberExpression',
        },
      ],
    },
    {
      code: 'Template.foo_bar.helpers({})',
      errors: [
        {
          message: 'Invalid template name, expected name to be in camel-case',
          type: 'MemberExpression',
        },
      ],
    },
    {
      code: 'Template.foo_bar.helpers({})',
      options: ['pascal-case'],
      errors: [
        {
          message: 'Invalid template name, expected name to be in pascal-case',
          type: 'MemberExpression',
        },
      ],
    },
    {
      code: 'Template["foo-bar"].helpers({})',
      options: ['snake-case'],
      errors: [
        {
          message: 'Invalid template name, expected name to be in snake-case',
          type: 'MemberExpression',
        },
      ],
    },
    {
      code: 'Template["foo_bar"].helpers({})',
      options: ['upper-snake-case'],
      errors: [
        {
          message:
            'Invalid template name, expected name to be in upper-snake-case',
          type: 'MemberExpression',
        },
      ],
    },
  ],
});
