/* eslint-env mocha */

var assert = require('assert')
var path = require('path')
var rewire = require('rewire')
var getMeteorProjectRootPath = rewire('../../../dist/util/getMeteorProjectRootPath.js')


var isInMeteorProject
getMeteorProjectRootPath.__set__('pathExists', {
  sync: function () {
    return isInMeteorProject
  }
})


describe('getMeteorProjectRootPath', function () {
  it('returns false for top-level directory', function () {
    assert.equal(getMeteorProjectRootPath(path.sep), false)
  })

  it('returns false when not in meteor project', function () {
    isInMeteorProject = false
    assert.equal(getMeteorProjectRootPath('/not-in-meteor/sub'), false)
  })

  it('returns the directory when in meteor project', function () {
    isInMeteorProject = true
    var meteorPath = '/Users/anon/meteor-project'
    assert.equal(getMeteorProjectRootPath(meteorPath), meteorPath)
  })
})
