/* eslint-env mocha */

// Tests in this file will fail on windows, because they always use forward-slashes,
// but the actual implementation uses slashes depending on the OS.
// To fix the tests, use path.sep to determine correct slashes.

import assert from 'assert'

function matcher (filename) {
  return (
    filename === '/User/anon/a/b/meteor-project' ||
    filename === '/User/anon/a/b/c/meteor-project'
  )
}

var findOneUpwards = require('../../../../dist/util/internal/findOneUpwards.js')

describe('findOneUpwards', function () {
  it('returns false when no project is found', function () {
    var result = findOneUpwards('/User/otherguy/', matcher)
    assert.equal(result, false)
  })

  it('returns the path when it\'s the same directory', function () {
    var result = findOneUpwards('/User/anon/a/b/meteor-project', matcher)
    assert.equal(result, '/User/anon/a/b/meteor-project')
  })

  it('returns a parent Meteor project', function () {
    var result = findOneUpwards('/User/anon/a/b/meteor-project/x/y/z', matcher)
    assert.equal(result, '/User/anon/a/b/meteor-project')
  })
})
