/**
 * @fileoverview Enforce check on all arguments passed to methods and publish functions
 * @author Dominik Ferber
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

const { RuleTester } = require('eslint');
const rule = require('../../../lib/rules/audit-argument-checks');

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester();
ruleTester.run('audit-argument-checks', rule, {
  valid: [
    'foo()',

    'Meteor[x]()',
    'Meteor["publish"]()',
    'Meteor.publish()',

    {
      code: 'Meteor.publish("foo", function ({ x }) {})',
      parserOptions: { ecmaVersion: 6 },
    },
    {
      code: 'Meteor.publish("foo", () => {})',
      parserOptions: { ecmaVersion: 6 },
    },
    'Meteor.publish("foo", function () {})',
    'Meteor.publish("foo", function (bar) { check(bar, Match.Any); })',
    {
      code: 'Meteor.publish("foo", (bar) =>  { check(bar, Match.Any); })',
      parserOptions: { ecmaVersion: 6 },
    },
    'Meteor.publish("foo", function (bar, baz) { check(bar, Match.Any); check(baz, Match.Any); })',
    {
      code: 'Meteor.publish("foo", function (bar) { checkId(bar); })',
      options: [{ checkEquivalents: ['checkId'] }],
    },
    {
      code:
        'Meteor.publish("foo", function (bar) { var r; r = checkId(bar); })',
      options: [{ checkEquivalents: ['checkId'] }],
    },
    {
      code: 'Meteor.publish("foo", function () { checkId(); })',
      options: [{ checkEquivalents: ['checkId'] }],
    },

    'Meteor.methods()',
    'Meteor.methods({ x: function () {} })',
    'Meteor["methods"]({ x: function () {} })',
    'Meteor.methods({ x: true })',
    { code: 'Meteor.methods({ x () {} })', parserOptions: { ecmaVersion: 6 } },
    'Meteor.methods({ x: function (bar) { check(bar, Match.Any); } })',
    {
      code: 'Meteor.methods({ x: function (bar) { checkId(bar); } })',
      options: [{ checkEquivalents: ['checkId'] }],
    },
    'Meteor.methods({ x: function (bar, baz) { check(bar, Match.Any); check(baz, Match.Any); } })',
    `
      Meteor.methods({
        sendEmail: function (to, from, subject, text) {
          check([to, from, subject, text], [String]);
        },
      })
    `,
    {
      code: `
        Meteor.methods({
          sendEmail (to, from, subject, text) {
            check([to, from, subject, text], [String]);
          },
        })
      `,
      parserOptions: { ecmaVersion: 6 },
    },
    {
      code: `
        Meteor.methods({
            barWellChecked (bar = null) {
                check(bar, Match.OneOf(Object, null));
            }
        })
      `,
      parserOptions: { ecmaVersion: 6 },
    },
    {
      code: `
        Meteor.methods({
            barWellChecked (foo, bar = null) {
                check(foo, String);
                check(bar, Match.OneOf(Object, null));
            }
        })
      `,
      parserOptions: { ecmaVersion: 6 },
    },
  ],

  invalid: [
    {
      code: 'Meteor.publish("foo", function (bar) { foo(); })',
      errors: [
        {
          message: '"bar" is not checked',
          type: 'Identifier',
        },
      ],
    },
    {
      code: 'Meteor["publish"]("foo", function (bar) { foo(); })',
      errors: [
        {
          message: '"bar" is not checked',
          type: 'Identifier',
        },
      ],
    },
    {
      code: 'Meteor.publish("foo", function (bar) {})',
      errors: [
        {
          message: '"bar" is not checked',
          type: 'Identifier',
        },
      ],
    },
    {
      code:
        'Meteor.publish("foo", function (bar, baz) { check(bar, Match.Any); })',
      errors: [
        {
          message: '"baz" is not checked',
          type: 'Identifier',
        },
      ],
    },
    {
      code: 'Meteor.methods({ foo: function (bar) {} })',
      errors: [
        {
          message: '"bar" is not checked',
          type: 'Identifier',
        },
      ],
    },
    {
      code: 'Meteor.methods({ foo: function () {}, foo2: function (bar) {} })',
      errors: [
        {
          message: '"bar" is not checked',
          type: 'Identifier',
        },
      ],
    },
    {
      code: 'Meteor.methods({ foo () {}, foo2 (bar) {} })',
      errors: [
        {
          message: '"bar" is not checked',
          type: 'Identifier',
        },
      ],
      parserOptions: { ecmaVersion: 6 },
    },
    {
      code: `
        Meteor.methods({
          foo () {},
          foo2 (bar) {
            if (!Meteor.isServer) {
              check(bar, Meteor.any)
            }
          }
        })
      `,
      errors: [
        {
          message: '"bar" is not checked',
          type: 'Identifier',
        },
      ],
      parserOptions: { ecmaVersion: 6 },
    },
    {
      code: `
        Meteor.methods({
          foo: (bar) => 2
        })
      `,
      errors: [
        {
          message: '"bar" is not checked',
          type: 'Identifier',
        },
      ],
      parserOptions: { ecmaVersion: 6 },
    },
    {
      code: `
        Meteor.methods({
          sendEmail: function (to, from, subject, bar) {
            check([to, from, subject], [String]);
          }
        })
      `,
      errors: [
        {
          message: '"bar" is not checked',
          type: 'Identifier',
        },
      ],
    },
    {
      code: `
        Meteor.methods({
          sendEmail (to, from, subject, bar) {
            check([to, from, subject], [String]);
          }
        })
      `,
      errors: [
        {
          message: '"bar" is not checked',
          type: 'Identifier',
        },
      ],
      parserOptions: { ecmaVersion: 6 },
    },
    {
      code: `
        Meteor.methods({
          sendEmail (to, from, subject, bar) {
            check([to, from, subject, 'bar'], [String]);
          }
        })
      `,
      errors: [
        {
          message: '"bar" is not checked',
          type: 'Identifier',
        },
      ],
      parserOptions: { ecmaVersion: 6 },
    },
    {
      code: `
        Meteor.methods({
          barBadlyChecked (bar = null) {
              check(foo, Match.OneOf(Object, null));
          }
        })
      `,
      errors: [
        {
          message: '"bar" is not checked',
          type: 'Identifier',
        },
      ],
      parserOptions: { ecmaVersion: 6 },
    },
  ],
});
