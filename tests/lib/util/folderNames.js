/* eslint-env mocha */

const assert = require('assert')

describe('folder names', function () {
  it('is defined', function () {
    assert.ok(require('../../../dist/util/folderNames.js'))
  })
})
