/* eslint-env mocha */

import assert from 'assert'
import getExecutorsFromTest from '../../../../dist/util/executors/getExecutorsFromTest'

describe('getExecutorsFromTest', function () {
  describe('MemberExpression', function () {
    it('isClient', function () {
      const result = getExecutorsFromTest({
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'Meteor'
        },
        property: {
          type: 'Identifier',
          name: 'isClient'
        }
      })
      assert.equal(result.size, 2)
      assert.ok(result.has('browser'))
      assert.ok(result.has('cordova'))
    })
    it('isServer', function () {
      const result = getExecutorsFromTest({
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'Meteor'
        },
        property: {
          type: 'Identifier',
          name: 'isServer'
        }
      })
      assert.equal(result.size, 1)
      assert.ok(result.has('server'))
    })
    it('isCordova', function () {
      const result = getExecutorsFromTest({
        type: 'MemberExpression',
        object: {
          type: 'Identifier',
          name: 'Meteor'
        },
        property: {
          type: 'Identifier',
          name: 'isCordova'
        }
      })
      assert.equal(result.size, 1)
      assert.ok(result.has('cordova'))
    })
    it('throws on unkown Meteor prop', function () {
      assert.throws(
        () => {
          getExecutorsFromTest({
            type: 'MemberExpression',
            object: {
              type: 'Identifier',
              name: 'Meteor'
            },
            property: {
              type: 'Identifier',
              name: 'isNotAMeteorProp'
            }
          })
        }
      )
    })
  })


  describe('LogicalExpression', function () {
    it('resolves isServer AND isClient', function () {
      const result = getExecutorsFromTest({
        type: 'LogicalExpression',
        operator: '&&',
        left: {
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
        right: {
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
      })
      assert.equal(result.size, 0)
    })

    it('resolves isServer OR isClient', function () {
      const result = getExecutorsFromTest({
        type: 'LogicalExpression',
        operator: '||',
        left: {
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
        right: {
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
      })
      assert.equal(result.size, 3)
      assert.ok(result.has('browser'))
      assert.ok(result.has('server'))
      assert.ok(result.has('cordova'))
    })

    it('throws for unkown operator in LogicalExpression', function () {
      assert.throws(() => {
        getExecutorsFromTest({
          type: 'LogicalExpression',
          operator: 'XY',
          left: {},
          right: {}
        })
      })
    })
  })
})
