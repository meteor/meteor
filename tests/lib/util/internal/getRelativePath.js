/* eslint-env mocha */

import assert from 'assert'
var rewire = require('rewire')
var getRelativePath = rewire('../../../../dist/util/internal/getRelativePath.js')

getRelativePath.__set__('getRootPath', function (filename) {
  if (filename === '/Users/anon/git/meteor-project/client/file.js') {
    return '/Users/anon/git/meteor-project'
  }
})

describe('getRelativePath', function () {
  it('gets the correct relative path', function () {
    var result = getRelativePath('/Users/anon/git/meteor-project/client/file.js')
    assert.equal(result, 'client/file.js')
  })
})
