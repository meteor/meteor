/* eslint-env mocha */

import assert from 'assert'
import {difference, union, intersection} from '../../../../dist/util/executors/sets'

describe('executors', function () {

  describe('union', function () {
    it('unifies two sets', function () {
      const result = union(new Set(['cordova']), new Set(['client', 'server']))
      assert.equal(result.size, 3)
      assert.ok(result.has('client'))
      assert.ok(result.has('cordova'))
      assert.ok(result.has('server'))
    })
  })

  describe('difference', function () {
    it('returns the difference when b contains nothing from a', function () {
      const result = difference(new Set(['cordova']), new Set(['client', 'server']))
      assert.equal(result.size, 1)
      assert.ok(result.has('cordova'))
    })

    it('returns the difference when b contains one value from a', function () {
      const result = difference(new Set(['client', 'cordova']), new Set(['client', 'server']))
      assert.equal(result.size, 1)
      assert.ok(result.has('cordova'))
    })
  })

  describe('intersection', function () {
    it('returns the intersection', function () {
      const result = intersection(new Set(['client', 'cordova']), new Set(['client', 'server']))
      assert.equal(result.size, 1)
      assert.ok(result.has('client'))
    })
  })
})
