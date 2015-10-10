/* eslint-env mocha */

const assert = require('assert')

describe('environment', function () {
  it('is defined', function () {
    assert.ok(require('../../../dist/util/environment.js'))
  })
})
