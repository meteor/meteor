/* eslint-env mocha */

import assert from 'assert'
import {NON_METEOR} from '../../../dist/util/environment'

const rewire = require('rewire')
const getMeta = rewire('../../../dist/util/getMeta')
getMeta.__set__('getRelativePath', function (path) {
  return path
})

describe('getMeta', function () {
  it('returns information when a filename is set', function () {
    const result = getMeta('client/index.js')
    assert.equal(typeof result, 'object')
  })

  it('returns no information when a filename is set', function () {
    const result = getMeta()
    assert.equal(typeof result, 'object')
    assert.equal(result.env, NON_METEOR)
  })
})
