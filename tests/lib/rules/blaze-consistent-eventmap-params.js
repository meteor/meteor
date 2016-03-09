/**
 * @fileoverview Ensures that the names of the arguments of event handlers are always the same
 * @author Philipp Sporrer, Dominik Ferber
 * @copyright 2015 Philipp Sporrer. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

const rule = require('../../../lib/rules/blaze-consistent-eventmap-params')
const RuleTester = require('eslint').RuleTester

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester()
ruleTester.run('blaze-consistent-eventmap-params', rule, {
  valid: [
    `
      Foo.bar.events({
        'submit form': function (bar, baz) {
          // no error, because not on Template
        }
      })
    `,
    `
      Template.foo.events({
        'submit form': function (event) {}
      })
    `,
    `
      Template['foo'].events({
        'submit form': function (event) {}
      })
    `,
    `
      Template['foo']['events']({
        'submit form': function (event) {}
      })
    `,
    `
      Template.foo['events']({
        'submit form': function (event) {}
      })
    `,
    `
      Template.foo.events({
        'submit form': {}
      })
    `,
    `
      Template.foo.events()
    `,
    `
      Template.foo.events(null)
    `,
    {
      code: `
        Template.foo.events({
          'submit form': function (evt) {}
        })
      `,
      options: [{
        eventParamName: 'evt',
      }],
    },
    {
      code: `
        Template.foo.events({
          'submit form': function (evt, tmplInst) {}
        })
      `,
      options: [{
        eventParamName: 'evt',
        templateInstanceParamName: 'tmplInst',
      }],
    },
    `
      Template.foo.events({
        'submit form': function (event, templateInstance) {}
      })
    `,
    {
      code: `
        Template.foo.events({
          'submit form': (event, templateInstance) => {}
        })
      `,
      parser: 'babel-eslint',
    },
    `
      Nontemplate.foo.events({
        'submit form': function (bar, baz) {
          // no error, because not on Template
        }
      })
    `,
    `
      if (Meteor.isCordova) {
        Template.foo.events({
          'submit form': function (event, templateInstance) {}
        })
      }
    `,
    `
      if (Meteor.isClient) {
        Template.foo.events({
          'submit form': function (event, templateInstance) {}
        })
      }
    `,
    {
      code: `
        if (Meteor.isClient) {
          Template.foo.events({
            'submit form': (event, templateInstance) => {}
          })
        }
      `,
      parser: 'babel-eslint',
    },
  ],

  invalid: [
    {
      code: `
        Template.foo.events({
          'submit form': function (foo, bar) {}
        })
      `,
      errors: [
        { message: 'Invalid parameter name, use "event" instead', type: 'Identifier' },
        { message: 'Invalid parameter name, use "templateInstance" instead', type: 'Identifier' },
      ],
    },
    {
      code: `
        Template['foo'].events({
          'submit form': function (foo, bar) {}
        })
      `,
      errors: [
        { message: 'Invalid parameter name, use "event" instead', type: 'Identifier' },
        { message: 'Invalid parameter name, use "templateInstance" instead', type: 'Identifier' },
      ],
    },
    {
      code: `
        Template['foo']['events']({
          'submit form': function (foo, bar) {}
        })
      `,
      errors: [
        { message: 'Invalid parameter name, use "event" instead', type: 'Identifier' },
        { message: 'Invalid parameter name, use "templateInstance" instead', type: 'Identifier' },
      ],
    },
    {
      code: `
        Template.foo['events']({
          'submit form': function (foo, bar) {}
        })
      `,
      errors: [
        { message: 'Invalid parameter name, use "event" instead', type: 'Identifier' },
        { message: 'Invalid parameter name, use "templateInstance" instead', type: 'Identifier' },
      ],
    },
    {
      code: `
        Template.foo.events({
          'submit form': (foo, bar) => {}
        })
      `,
      errors: [
        { message: 'Invalid parameter name, use "event" instead', type: 'Identifier' },
        { message: 'Invalid parameter name, use "templateInstance" instead', type: 'Identifier' },
      ],
      parser: 'babel-eslint',
    },
    {
      code: `
        Template.foo.events({
          'submit form': function (foo, templateInstance) {}
        })
      `,
      errors: [
        { message: 'Invalid parameter name, use "event" instead', type: 'Identifier' },
      ],
    },
    {
      code: `
        Template.foo.events({
          'submit form': function (event, bar) {}
        })
      `,
      errors: [
        { message: 'Invalid parameter name, use "templateInstance" instead', type: 'Identifier' },
      ],
    },
    {
      code: `
        if (Meteor.isClient) {
          Template.foo.events({
            'submit form': function (foo, bar) {}
          })
        }
      `,
      errors: [
        { message: 'Invalid parameter name, use "event" instead', type: 'Identifier' },
        { message: 'Invalid parameter name, use "templateInstance" instead', type: 'Identifier' },
      ],
    },
  ],
})
