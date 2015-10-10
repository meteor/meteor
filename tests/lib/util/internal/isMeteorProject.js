/* eslint-env mocha */

import assert from 'assert'
const rewire = require('rewire')
const isMeteorProject = rewire('../../../../dist/util/internal/isMeteorProject')

isMeteorProject.__set__('pathExists', {
  sync: function (path) {
    return path === '/Users/anon/git/meteor-project/.meteor/release'
  }
})

describe('isMeteorProject', function () {
  it('detects a Meteor project', function () {
    const result = isMeteorProject('/Users/anon/git/meteor-project')
    assert.ok(result)
  })

  it('does not detect a non-Meteor project', function () {
    const result = isMeteorProject('/Users/anon/git/non-meteor-project')
    assert.equal(result, false)
  })
})
