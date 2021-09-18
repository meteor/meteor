/**
 * @fileoverview Forbid DOM lookup in template creation callback
 * @author Dominik Ferber
 * @copyright 2016 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

const { RuleTester } = require('eslint');
const rule = require('../../../lib/rules/no-dom-lookup-on-created');

const ruleTester = new RuleTester();

ruleTester.run('no-dom-lookup-on-created', rule, {
  valid: [
    '$(".bar").focus()',
    `
      Template.foo.onRendered(function () {
        $('.bar').focus()
      })
    `,
    `
      Template.foo.onRendered(function () {
        this.$('.bar').focus()
      })
    `,
    `
      Template.foo.onRendered(function () {
        Template.instance().$('.bar').focus()
      })
    `,
  ],

  invalid: [
    {
      code: `
        Template.foo.onCreated(function () {
          $('.bar').focus()
        })
      `,
      errors: [
        {
          message:
            'Accessing DOM from "onCreated" is forbidden. Try from "onRendered" instead.',
          type: 'CallExpression',
        },
      ],
    },
    {
      code: `
        Template.foo.onCreated(function () {
          Template.instance().$('.bar').focus()
        })
      `,
      errors: [
        {
          message:
            'Accessing DOM from "onCreated" is forbidden. Try from "onRendered" instead.',
          type: 'CallExpression',
        },
      ],
    },
  ],
});
