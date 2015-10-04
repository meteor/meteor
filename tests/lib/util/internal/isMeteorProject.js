/* eslint-env mocha */

import assert from 'assert'
var rewire = require('rewire')
var isMeteorProject = rewire('../../../../dist/util/internal/isMeteorProject')

isMeteorProject.__set__('pathExists', {
  sync: function (path) {
    return path === '/Users/anon/git/meteor-project/.meteor/release'
  }
})

describe('isMeteorProject', function () {
  it('detects a Meteor project', function () {
    var result = isMeteorProject('/Users/anon/git/meteor-project')
    assert.ok(result)
  })

  it('does not detect a non-Meteor project', function () {
    var result = isMeteorProject('/Users/anon/git/non-meteor-project')
    assert.equal(result, false)
  })
})
