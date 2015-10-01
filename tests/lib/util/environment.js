/* eslint-env mocha */

var assert = require('assert')

describe('environment', function () {
  it('is defined', function () {
    assert.ok(require('../../../dist/util/environment.js'))
  })
})
