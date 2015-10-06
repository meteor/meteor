/* eslint-env mocha */

import assert from 'assert'
import {NON_METEOR} from '../../../dist/util/environment'

var rewire = require('rewire')
var getMeta = rewire('../../../dist/util/getMeta')
getMeta.__set__('getRelativePath', function (path) {
  return path
})

describe('getMeta', function () {
  it('returns information when a filename is set', function () {
    var result = getMeta('client/index.js')
    assert.equal(typeof result, 'object')
  })

  it('returns no information when a filename is set', function () {
    var result = getMeta()
    assert.equal(typeof result, 'object')
    assert.equal(result.env, NON_METEOR)
  })
})
