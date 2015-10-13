/* eslint-env mocha */

import assert from 'assert'
const rewire = require('rewire')
const getRelativePath = rewire('../../../../dist/util/meta/getRelativePath.js')

getRelativePath.__set__('getRootPath', function (filename) {
  if (filename === '/Users/anon/git/meteor-project/client/file.js') {
    return '/Users/anon/git/meteor-project'
  }
  return false
})

describe('getRelativePath', function () {
  it('gets the correct relative path', function () {
    const result = getRelativePath('/Users/anon/git/meteor-project/client/file.js')
    assert.equal(result, 'client/file.js')
  })

  it('returns false if no root path is found', function () {
    const result = getRelativePath('/Users/anon/git/file.js')
    assert.equal(result, false)
  })
})
