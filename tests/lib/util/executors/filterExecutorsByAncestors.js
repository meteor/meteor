/* eslint-env mocha */

import assert from 'assert'
import filterExecutorsByAncestors from '../../../../dist/util/executors/filterExecutorsByAncestors'

describe('filterExecutorsByAncestors', function () {

  it('filters on MemberExpression for isClient', function () {
    const consequent = {type: 'BlockStatement'}
    const result = filterExecutorsByAncestors(new Set(['browser', 'server']), [
      {type: 'Program'},
      {
        type: 'IfStatement',
        test: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'Meteor'
          },
          property: {
            type: 'Identifier',
            name: 'isClient'
          }
        },
        consequent: consequent
      },
      consequent
    ])
    assert.equal(result.size, 1)
    assert.ok(result.has('browser'))
  })

  it('filters on MemberExpression for else-block of isClient', function () {
    const alternate = {type: 'BlockStatement'}
    const result = filterExecutorsByAncestors(new Set(['browser', 'server']), [
      {type: 'Program'},
      {
        type: 'IfStatement',
        test: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'Meteor'
          },
          property: {
            type: 'Identifier',
            name: 'isClient'
          }
        },
        alternate: alternate
      },
      alternate
    ])
    assert.equal(result.size, 1)
    assert.ok(result.has('server'))
  })

  it('warns on hierarchical error', function () {
    assert.throws(() => {
      const consequent = {type: 'BlockStatement'}
      filterExecutorsByAncestors(new Set(['browser', 'server']), [
        {type: 'Program'},
        {
          type: 'IfStatement',
          test: {
            type: 'MemberExpression',
            object: {
              type: 'Identifier',
              name: 'Meteor'
            },
            property: {
              type: 'Identifier',
              name: 'isClient'
            }
          }
        },
        consequent
      ])
    })
  })

  it('filters on MemberExpression for isServer', function () {
    const consequent = {type: 'BlockStatement'}
    const result = filterExecutorsByAncestors(new Set(['server', 'cordova']), [
      {type: 'Program'},
      {
        type: 'IfStatement',
        test: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'Meteor'
          },
          property: {
            type: 'Identifier',
            name: 'isServer'
          }
        },
        consequent: consequent
      },
      consequent
    ])
    assert.equal(result.size, 1)
    assert.ok(result.has('server'))
  })

  it('filters on MemberExpression for isCordova', function () {
    const consequent = {type: 'BlockStatement'}
    const result = filterExecutorsByAncestors(new Set(['browser', 'cordova']), [
      {type: 'Program'},
      {
        type: 'IfStatement',
        test: {
          type: 'MemberExpression',
          object: {
            type: 'Identifier',
            name: 'Meteor'
          },
          property: {
            type: 'Identifier',
            name: 'isCordova'
          }
        },
        consequent: consequent
      },
      consequent
    ])
    assert.equal(result.size, 1)
    assert.ok(result.has('cordova'))
  })

  it('filters on UnaryExpression', function () {
    const consequent = {type: 'BlockStatement'}
    const result = filterExecutorsByAncestors(new Set(['browser', 'server', 'cordova']), [
      {type: 'Program'},
      {
        type: 'IfStatement',
        test: {
          type: 'UnaryExpression',
          operator: '!',
          argument: {
            type: 'MemberExpression',
            object: {
              type: 'Identifier',
              name: 'Meteor'
            },
            property: {
              type: 'Identifier',
              name: 'isClient'
            }
          }
        },
        consequent: consequent
      },
      consequent
    ])
    assert.equal(result.size, 1)
    assert.ok(result.has('server'))
  })

  it('returns no executors when an unresolvable IfStatement is in ancestors', function () {
    const consequent = {type: 'BlockStatement'}
    const ifConsequent = {
      test: {
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'Meteor'
        },
        property: {
          type: 'Identifier',
          name: 'isClient'
        }
      },
      consequent: consequent
    }
    const result = filterExecutorsByAncestors(new Set(['browser', 'server']), [
      {type: 'Program'},
      {
        type: 'IfStatement',
        test: {type: 'Identifier'},
        consequent: ifConsequent
      },
      ifConsequent,
      consequent
    ])
    assert.equal(result.size, 0)
  })

})
