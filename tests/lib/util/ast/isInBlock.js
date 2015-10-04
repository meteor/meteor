/* eslint-env mocha */

import assert from 'assert'
import {CLIENT, SERVER, UNIVERSAL} from '../../../../dist/util/environment'
import {isInBlock, isInServerBlock, isInClientBlock} from '../../../../dist/util/ast/isInBlock'

describe('isInBlock', function () {
  it('returns false if no ancestors are present', function () {
    assert.equal(isInBlock([], CLIENT), false)
    assert.equal(isInBlock([], SERVER), false)
  })

  it('throws if no ancestors are given', function () {
    assert.throws(isInClientBlock, Error)
    assert.throws(isInServerBlock, Error)
  })

  it('throws if no environment is given', function () {
    assert.throws(isInBlock.bind(null, []), Error)
  })

  it('throws when called with unhandeled environment', function () {
    assert.throws(isInBlock.bind(null, [], UNIVERSAL))
  })
})
