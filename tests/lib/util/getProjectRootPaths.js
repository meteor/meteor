/* eslint-env mocha */

var assert = require('assert')
var rewire = require('rewire')
var getProjectRootPaths = rewire('../../../dist/util/getProjectRootPaths.js')

var walkShouldFindRoot
getProjectRootPaths.__set__('walk', {
  sync: function (start, options, cb) {
    var context = {ignore: function () {}}
    if (walkShouldFindRoot) {
      cb.call(context, '/User/anon/a/b/meteor-project')
      cb.call(context, '/User/anon/a/b/c/meteor-project')
    } else {
      cb.call(context, '/User/otherguy')
      cb.call(context, '/User/otherguy/a')
      cb.call(context, '/User/otherguy/b')
      cb.call(context, '/User/otherguy/a/b')
    }
  }
})


function matcher (filename) {
  return (
    filename === '/User/anon/a/b/meteor-project' ||
    filename === '/User/anon/a/b/c/meteor-project'
  )
}

describe('getProjectRootPaths', function () {

  beforeEach(function () {
    walkShouldFindRoot = true
  })

  it(`returns an empty array when no project is found`, function () {
    walkShouldFindRoot = false
    var result = getProjectRootPaths('/User/otherguy/', matcher)
    assert.ok(Array.isArray(result))
    assert.equal(result.length, 0)
  })

  it(`returns the path when it's the same directory`, function () {
    var result = getProjectRootPaths('/User/anon/a/b/meteor-project', matcher)
    assert.equal(result.length, 1)
    assert.equal(result[0], '/User/anon/a/b/meteor-project')
  })

  it(`returns a parent Meteor project`, function () {
    var result = getProjectRootPaths('/User/anon/a/b/meteor-project/a/b/c', matcher)

    assert.equal(result.length, 1)
    assert.equal(result[0], '/User/anon/a/b/meteor-project')
  })

  it(`returns all child Meteor projects`, function () {
    var result = getProjectRootPaths('/User/anon', matcher)

    assert.equal(result.length, 2)
    assert.equal(result[0], '/User/anon/a/b/meteor-project')
    assert.equal(result[1], '/User/anon/a/b/c/meteor-project')
  })
})
