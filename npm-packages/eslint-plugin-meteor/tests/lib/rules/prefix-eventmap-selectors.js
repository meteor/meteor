/**
 * @fileoverview Convention for eventmap selectors
 * @author Dominik Ferber
 * @copyright 2016 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

const { RuleTester } = require('eslint');
const rule = require('../../../lib/rules/prefix-eventmap-selectors');

const ruleTester = new RuleTester();

ruleTester.run('prefix-eventmap-selectors', rule, {
  valid: [
    // ------------------------------------------------------------------------
    // Relaxed mode (default)
    // ------------------------------------------------------------------------
    'Template.foo.events({"click .js-foo": function () {}})',
    {
      code: 'Template.foo.events({"click .js-foo"() {}})',
      parserOptions: { ecmaVersion: 6 },
    },
    'Template.foo.events({"blur .js-bar": function () {}})',
    'Template.foo.events({"click": function () {}})',
    'Template.foo.events({"click": function () {}, "click .js-bar": function () {}})',
    `
      Template.foo.events({
        'click .js-foo': function () {},
        'blur .js-bar': function () {},
        'click #foo': function () {},
        'click [data-foo="bar"]': function () {},
        'click input': function () {},
        'click': function () {},
      })
    `,
    // ------------------------------------------------------------------------
    // Strict mode
    // ------------------------------------------------------------------------
    {
      code: 'Template.foo.events({"click .js-foo": function () {}})',
      options: ['js-', 'strict'],
    },
    // ------------------------------------------------------------------------
    // Prefix
    // ------------------------------------------------------------------------
    {
      code: 'Template.foo.events({"click .bar-foo": function () {}})',
      options: ['bar-'],
    },
    // ------------------------------------------------------------------------
    // Edge cases
    // ------------------------------------------------------------------------
    {
      code: 'Template.foo.events({[bar]: function () {}})',
      parserOptions: { ecmaVersion: 6 },
    },
    'Template.foo.events(foo)',
    'Template.foo.events()',
    'Template.foo.helpers()',
  ],

  invalid: [
    // ------------------------------------------------------------------------
    // Relaxed mode (default)
    // ------------------------------------------------------------------------
    {
      code: 'Template.foo.events({"click .foo": function () {}})',
      errors: [
        {
          message: 'Expected selector to be prefixed with "js-"',
          type: 'Literal',
        },
      ],
    },
    {
      code: 'Template.foo.events({"click .foo"() {}})',
      parserOptions: { ecmaVersion: 6 },
      errors: [
        {
          message: 'Expected selector to be prefixed with "js-"',
          type: 'Literal',
        },
      ],
    },
    {
      code: 'Template.foo.events({"click .foo": () => {}})',
      parserOptions: { ecmaVersion: 6 },
      errors: [
        {
          message: 'Expected selector to be prefixed with "js-"',
          type: 'Literal',
        },
      ],
    },
    {
      code: 'Template.foo.events({"click .js-foo": () => {}, "click .foo": () => {}})',
      parserOptions: { ecmaVersion: 6 },
      errors: [
        {
          message: 'Expected selector to be prefixed with "js-"',
          type: 'Literal',
        },
      ],
    },
    // ------------------------------------------------------------------------
    // Strict mode
    // ------------------------------------------------------------------------
    {
      code: 'Template.foo.events({"click .js-foo": () => {}, "click input": () => {}})',
      options: ['js-', 'strict'],
      parserOptions: { ecmaVersion: 6 },
      errors: [{ message: 'Expected selector to be a class', type: 'Literal' }],
    },
    {
      code: 'Template.foo.events({"click": () => {}})',
      options: ['js-', 'strict'],
      parserOptions: { ecmaVersion: 6 },
      errors: [{ message: 'Missing selector', type: 'Literal' }],
    },
    {
      code: 'Template.foo.events({"click #js-xy": function () {}})',
      options: ['js-', 'strict'],
      errors: [{ message: 'Expected selector to be a class', type: 'Literal' }],
    },
    {
      code: 'Template.foo.events({"click [data-foo=bar]": function () {}})',
      options: ['js-', 'strict'],
      errors: [{ message: 'Expected selector to be a class', type: 'Literal' }],
    },
    {
      code: `
        Template.foo.events({
          "click": () => {},
          "click .foo": () => {},
          "click input": () => {},
          "click .js-foo, blur input": () => {},
        })
      `,
      options: ['js-', 'strict'],
      parserOptions: { ecmaVersion: 6 },
      errors: [
        { message: 'Missing selector', type: 'Literal' },
        {
          message: 'Expected selector to be prefixed with "js-"',
          type: 'Literal',
        },
        { message: 'Expected selector to be a class', type: 'Literal' },
        { message: 'Expected selector to be a class', type: 'Literal' },
      ],
    },
    // ------------------------------------------------------------------------
    // Prefix
    // ------------------------------------------------------------------------
    {
      code: 'Template.foo.events({"click .js-foo": () => {}})',
      options: ['bar-'],
      parserOptions: { ecmaVersion: 6 },
      errors: [
        {
          message: 'Expected selector to be prefixed with "bar-"',
          type: 'Literal',
        },
      ],
    },
    // ------------------------------------------------------------------------
    // Edge cases
    // ------------------------------------------------------------------------
    {
      code: 'Template.foo.events({"click .js-": function () {}})',
      errors: [
        { message: 'Selector may not consist of prefix only', type: 'Literal' },
      ],
    },
  ],
});
