/**
 * @fileoverview Scope DOM lookups to the template instance
 * @author Dominik Ferber
 * @copyright 2016 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

const { RuleTester } = require('eslint');
const rule = require('../../../lib/rules/scope-dom-lookups');

const ruleTester = new RuleTester();

ruleTester.run('scope-dom-lookups', rule, {
  valid: [
    '$(".foo")',
    'Template.foo.xyz(function () { $(".foo"); })',
    `
      Template.foo.onRendered(function () {
        this.$('.bar').addClass('baz')
      })
    `,
    `
      Template.foo.onRendered(function () {
        Template.instance().$('.bar').addClass('.baz')
      })
    `,
    `
      Template.foo.events({
        'click .js-bar': function (event, instance) {
          instance.$('.baz').focus()
        }
      })
    `,
  ],

  invalid: [
    {
      code: `
        Template.foo.onRendered(function () {
          $('.bar').addClass('baz')
        })
      `,
      errors: [
        { message: 'Use scoped DOM lookup instead', type: 'CallExpression' },
      ],
    },
    {
      code: `
        Template.foo.events({
          'click .js-bar': function (event, instance) {
            $('.baz').focus()
          }
        })
      `,
      errors: [
        { message: 'Use scoped DOM lookup instead', type: 'CallExpression' },
      ],
    },
    {
      code: `
        Template.foo.onRendered(function () {
          var $bar = $('.bar')
          $bar.addClass('baz')
        })
      `,
      errors: [
        { message: 'Use scoped DOM lookup instead', type: 'CallExpression' },
      ],
    },
    {
      code: `
        Template.foo.helpers({
          'bar': function () {
            $('.baz').focus()
          }
        })
      `,
      errors: [
        { message: 'Use scoped DOM lookup instead', type: 'CallExpression' },
      ],
    },
    {
      code: `
        Template.foo.onDestroyed(function () {
          $('.bar').addClass('baz')
        })
      `,
      errors: [
        { message: 'Use scoped DOM lookup instead', type: 'CallExpression' },
      ],
    },
    {
      code: `
        Template.foo.onRendered(function () {
          jQuery('.bar').addClass('baz')
        })
      `,
      errors: [
        { message: 'Use scoped DOM lookup instead', type: 'CallExpression' },
      ],
    },
  ],
});
