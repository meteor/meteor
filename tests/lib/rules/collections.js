/**
 * @fileoverview Core API for collections
 * @author colDominik Ferber
 * @copyright 2015 colDominik Ferber. All rights reserved.
 * See LICENSE file in root directory for full license.
 */

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

import {NON_METEOR, UNIVERSAL, CLIENT, SERVER} from '../../../dist/util/environment'
const rule = require('../../../dist/rules/collections')
const RuleTester = require('eslint').RuleTester


const commonValidCode = [
  'foo = true',
  'var foo = true',
  'new Meteor.foo()',
  'new Mongo.Collection(null)',
  {
    code: 'Users.unkownProp()',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'new Mongo.Collection(null)',
    settings: {meteor: {}}
  },
  `
    if (Meteor.isClient && Meteor.isServer) {
      new Mongo.Collection()
    }
  `,
  {
    code: 'Users = new Mongo.Collection("users")',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.find()',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.find(foo)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.find(foo, bar)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.findOne()',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.findOne(foo)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.findOne(foo, bar)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.insert(selector, doc)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.update(selector, modifier)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.update(selector, modifier, options)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.update(selector, modifier, options, callback)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.upsert(selector, modifier)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.upsert(selector, modifier, options)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.upsert(selector, modifier, options, callback)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.remove(selector)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.remove(selector, callback)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.allow(options)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.deny(options)',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.rawCollection()',
    settings: {meteor: {collections: ['Users']}}
  },
  {
    code: 'Users.rawDatabase()',
    settings: {meteor: {collections: ['Users']}}
  }
]

const commonInvalidCode = [
  {
    code: 'new Mongo.Collection()',
    errors: [
      {message: 'At least one argument expected', type: 'NewExpression'}
    ]
  },
  {
    code: 'new Meteor.Collection()',
    errors: [
      {message: '"Meteor.Collection" is deprecated. Use "Mongo.Collection" instead.', type: 'NewExpression'}
    ]
  },
  {
    code: 'Users = true',
    settings: {meteor: {collections: ['Users']}},
    errors: [
      {message: 'Can not overwrite collection', type: 'AssignmentExpression'}
    ]
  },
  {
    code: 'var Users = true',
    settings: {meteor: {collections: ['Users']}},
    errors: [
      {message: 'Can not declare collection', type: 'VariableDeclarator'}
    ]
  },
  {
    code: 'Users.find(a, b, c)',
    settings: {meteor: {collections: ['Users']}},
    errors: [
      {message: 'Expected two arguments at most', type: 'CallExpression'}
    ]
  },
  {
    code: 'Users.findOne(a, b, c)',
    settings: {meteor: {collections: ['Users']}},
    errors: [
      {message: 'Expected two arguments at most', type: 'CallExpression'}
    ]
  },
  {
    code: 'Users.insert()',
    settings: {meteor: {collections: ['Users']}},
    errors: [
      {message: 'At least one argument expected', type: 'CallExpression'}
    ]
  },
  {
    code: 'Users.update()',
    settings: {meteor: {collections: ['Users']}},
    errors: [
      {message: 'At least two arguments expected', type: 'CallExpression'}
    ]
  },
  {
    code: 'Users.update(selector)',
    settings: {meteor: {collections: ['Users']}},
    errors: [
      {message: 'At least two arguments expected', type: 'CallExpression'}
    ]
  },
  {
    code: 'Users.upsert()',
    settings: {meteor: {collections: ['Users']}},
    errors: [
      {message: 'At least two arguments expected', type: 'CallExpression'}
    ]
  },
  {
    code: 'Users.upsert(selector)',
    settings: {meteor: {collections: ['Users']}},
    errors: [
      {message: 'At least two arguments expected', type: 'CallExpression'}
    ]
  },
  {
    code: 'Users.remove()',
    settings: {meteor: {collections: ['Users']}},
    errors: [
      {message: 'At least one argument expected', type: 'CallExpression'}
    ]
  },
  {
    code: 'Users.allow()',
    settings: {meteor: {collections: ['Users']}},
    errors: [
      {message: 'Expected one argument', type: 'CallExpression'}
    ]
  },
  {
    code: 'Users.deny()',
    settings: {meteor: {collections: ['Users']}},
    errors: [
      {message: 'Expected one argument', type: 'CallExpression'}
    ]
  },
  {
    code: 'Users.rawCollection(foo)',
    settings: {meteor: {collections: ['Users']}},
    errors: [
      {message: 'Expected no arguments', type: 'CallExpression'}
    ]
  },
  {
    code: 'Users.rawDatabase(foo)',
    settings: {meteor: {collections: ['Users']}},
    errors: [
      {message: 'Expected no arguments', type: 'CallExpression'}
    ]
  }
]

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester()
ruleTester.run('collections server', rule(() => ({env: SERVER})), {
  valid: [
    ...commonValidCode
  ],

  invalid: [
    ...commonInvalidCode
  ]
})

ruleTester.run('collections client', rule(() => ({env: CLIENT})), {
  valid: [
    ...commonValidCode
  ],

  invalid: [
    ...commonInvalidCode
  ]
})

ruleTester.run('collections universal', rule(() => ({env: UNIVERSAL})), {
  valid: [
    ...commonValidCode
  ],

  invalid: [
    ...commonInvalidCode
  ]
})

ruleTester.run('collections non-meteor', rule(() => ({env: NON_METEOR})), {
  valid: [
    ...commonValidCode,
    ...commonInvalidCode
  ],
  invalid: []
})
