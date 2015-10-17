/**
 * @fileoverview Core API for publications and subscriptions
 * @author Dominik Ferber
 * @copyright 2015 Dominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

const rule = require('../../../dist/rules/pubsub')
const RuleTester = require('eslint').RuleTester
import {CLIENT, SERVER, UNIVERSAL, NON_METEOR} from '../../../dist/util/environment.js'

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------


const commonValidTests = [
  `if (Meteor.isClient) { Meteor.subscribe('foo') }`,
  `if (Meteor.isCordova) { Meteor.subscribe('foo', { bar: true }) }`,
  `if (Meteor.isServer) { Meteor.publish('foo', function () {}) }`,
  `if (Meteor.isServer) { Meteor.publish('foo', function (a) {}) }`,
  {
    code: `
      if (Meteor.isServer) {
        Meteor.publish('foo', (a) => {

          // no publish handler object available in arrow functions,
          // but valid anyways
          return []
        })
      }`,
    parser: 'babel-eslint'
  },
  `
    if (Meteor.isServer) {
      Meteor.publish('foo', function () {
        bar(function () {
          this.userId()
        })
      })
    }
  `,
  `
    if (Meteor.isServer) {
      Meteor.publish('foo', function () {
        bar(function () {
          var self = this
          self.userId()
        })
      })
    }
  `,
  `
    if (Meteor.isServer) {
      Meteor.publish('foo', function () {
        this.userId
        this.connection
        this.added(collection, id, fields)
        this.changed(collection, id, fields)
        this.removed(collection, id)
        this.ready()
        this.onStop(function () {})
        this.error(new Meteor.Error('xyz'))
        this.error('xyz')
        this.stop()

        userId = this.userId
        connection = this.connection
      })
    }
  `,
  `
    if (Meteor.isServer) {
      Meteor.publish('foo', function () {
        var self = this
        foo({
          bar: function () {
            self.userId
            self.connection
            self.added(collection, id, fields)
            self.changed(collection, id, fields)
            self.removed(collection, id)
            self.ready()
            self.onStop(function () {})
            self.error(new Meteor.Error('xyz'))
            self.error('xyz')
            self.stop()

            userId = self.userId
            connection = self.connection
          }
        })
      })
    }
  `,
  `
    if (Meteor.isClient) {
      Meteor.subscribe('foo')
      Meteor.subscribe('foo', param1)
      Meteor.subscribe('foo', param1, param2)
      Meteor.subscribe('foo', function () {})
    }
  `
]

const ruleTester = new RuleTester()
ruleTester.run('pubsub - universal', rule(() => ({env: UNIVERSAL})), {
  valid: [
    ...commonValidTests,
    `
      if (Meteor.isServer) {
        if (Meteor.isClient) {
          Meteor.publish() // not checked because unreachable
        }
      }
    `,
    `
      if (Meteor.Client) {
        if (Meteor.isServer) {
          Meteor.subscribe() // not checked because unreachable
        }
      }
    `,
    {
      code: `
        if (Meteor.isServer) {
          Meteor.publish('foo', () => {
            this.userId() // valid because this is not a publication fn
            return []
          })
        }
      `,
      parser: 'babel-eslint'
    }
  ],
  invalid: [
    {
      code: 'Meteor.publish("foo", function () {})',
      errors: [{message: 'Allowed on server only', type: 'CallExpression'}]
    },
    {
      code: 'Meteor.subscribe("foo")',
      errors: [{message: 'Allowed on client only', type: 'CallExpression'}]
    }
  ]
})

ruleTester.run('pubsub - client', rule(() => ({env: CLIENT})), {
  valid: [...commonValidTests],
  invalid: [
    {
      code: `
        Meteor.subscribe()
      `,
      errors: [{message: 'At least one argument expected', type: 'CallExpression'}]
    }
  ]
})

ruleTester.run('pubsub - server', rule(() => ({env: SERVER})), {
  valid: [
    ...commonValidTests,
    `
      Meteor.publish('foo', function () {
        bar.userId()
      })
    `,
    `
      Meteor.publish('foo', function () {
        var self = true
        self = this
        self.userId() // not an error, because not assigend on delcaration
      })
    `,
    `
      Meteor.publish('foo', function () {
        var foo
        self.userId() // not an error, because not assigend on to "this" yet
        foo = this
      })
    `,
    `
      Meteor.publish('foo', function () {
        var self = this
        self = 'no longer this'
        self.userId() // not an error, because not assigend on delcaration
      })
    `
  ],
  invalid: [
    {code: 'Meteor.publish()', errors: [{message: 'Two arguments expected', type: 'CallExpression'}]},
    {code: 'Meteor.publish("foo")', errors: [{message: 'Two arguments expected', type: 'CallExpression'}]},
    {
      code: `
        Meteor.publish('foo', function () {
          x(() => {
            this.userId()
          })
        })
      `,
      parser: 'babel-eslint',
      errors: [
        {message: 'Not a function', type: 'CallExpression'}
      ]
    },
    {
      code: `
        Meteor.publish('foo', function () {
          var foo = this
          foo.userId()
        })
      `,
      errors: [
        {message: 'Not a function', type: 'CallExpression'}
      ]
    },
    {
      code: `
        Meteor.publish('foo', function () {
          this.userId()
          this.userId = true
          this.userId++

          this.connection()
          this.connection = true
          this.connection++

          this.added = true
          this.added++
          this.added(collection, id)

          this.changed = true
          this.changed++
          this.changed(collection, id)

          this.removed = true
          this.removed++
          this.removed(collection)

          this.ready = true
          this.ready++

          this.onStop = true
          this.onStop++
          this.onStop()

          this.error = true
          this.error++
          this.error()

          this.stop = true
          this.stop++
          this.stop(function () {})
        })
      `,
      errors: [

        // this.userId
        {message: 'Not a function', type: 'CallExpression'},
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},

        // this.connection
        {message: 'Not a function', type: 'CallExpression'},
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},

        // this.added
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},
        {message: 'Expected three arguments', type: 'CallExpression'},

        // this.changed
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},
        {message: 'Expected three arguments', type: 'CallExpression'},

        // this.removed
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},
        {message: 'Expected two arguments', type: 'CallExpression'},

        // this.ready
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},

        // this.onStop
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},
        {message: 'Expected one argument', type: 'CallExpression'},

        // this.error
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},
        {message: 'Expected one argument', type: 'CallExpression'},

        // this.stop
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},
        {message: 'Expected no arguments', type: 'CallExpression'}
      ]
    },
    {
      code: `
        Meteor.publish('foo', function () {
          var self = this

          foo({
            bar: function () {
              self.userId()
              self.userId = true
              self.userId++

              self.connection()
              self.connection = true
              self.connection++

              self.added = true
              self.added++
              self.added(collection, id)

              self.changed = true
              self.changed++
              self.changed(collection, id)

              self.removed = true
              self.removed++
              self.removed(collection)

              self.ready = true
              self.ready++

              self.onStop = true
              self.onStop++
              self.onStop()

              self.error = true
              self.error++
              self.error()

              self.stop = true
              self.stop++
              self.stop(function () {})
            }
          })
        })
      `,
      errors: [

        // this.userId
        {message: 'Not a function', type: 'CallExpression'},
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},

        // this.connection
        {message: 'Not a function', type: 'CallExpression'},
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},

        // this.added
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},
        {message: 'Expected three arguments', type: 'CallExpression'},

        // this.changed
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},
        {message: 'Expected three arguments', type: 'CallExpression'},

        // this.removed
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},
        {message: 'Expected two arguments', type: 'CallExpression'},

        // this.ready
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},

        // this.onStop
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},
        {message: 'Expected one argument', type: 'CallExpression'},

        // this.error
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},
        {message: 'Expected one argument', type: 'CallExpression'},

        // this.stop
        {message: 'Assignment not allowed', type: 'AssignmentExpression'},
        {message: 'Update not allowed', type: 'UpdateExpression'},
        {message: 'Expected no arguments', type: 'CallExpression'}
      ]
    }
  ]
})

ruleTester.run('pubsub - non-meteor', rule(() => ({env: NON_METEOR})), {
  valid: [
    ...commonValidTests,
    'Meteor.publish()'
  ],
  invalid: []
})
