/* eslint-env mocha */

import assert from 'assert'
import stripPathPrefix from '../../../../dist/util/internal/stripPathPrefix.js'

describe('stripPathPrefix', function () {
  it('strips path correctly', function () {
    var parent = '/Users/anon/git/meteor-project'
    var child = '/Users/anon/git/meteor-project/folder/file.js'
    var result = stripPathPrefix(parent, child)
    assert.equal(result, 'folder/file.js')
  })
})
