/* eslint-env mocha */

import assert from 'assert'
const rewire = require('rewire')
const getRootPath = rewire('../../../../dist/util/meta/getRootPath.js')

getRootPath.__set__('findOneUpwards', function (filename) {
  if (filename === '/Users/anon/git/meteor-project/file.js') {
    return '/Users/anon/git/meteor-project'
  }
})

describe('getRootPath', function () {
  it('finds the root path the first time', function () {
    const result = getRootPath('/Users/anon/git/meteor-project/file.js')
    assert.equal(result, '/Users/anon/git/meteor-project')
  })

  it('finds the root path on subsequent calls', function () {
    const result1 = getRootPath('/Users/anon/git/meteor-project/file.js')
    const result2 = getRootPath('/Users/anon/git/meteor-project/file.js')
    assert.equal(result1, '/Users/anon/git/meteor-project')
    assert.equal(result2, '/Users/anon/git/meteor-project')
  })
})
