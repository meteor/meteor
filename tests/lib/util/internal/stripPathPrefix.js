/* eslint-env mocha */

import assert from 'assert'
import stripPathPrefix from '../../../../dist/util/internal/stripPathPrefix.js'

describe('stripPathPrefix', function () {
  it('strips path correctly', function () {
    const parent = '/Users/anon/git/meteor-project'
    const child = '/Users/anon/git/meteor-project/folder/file.js'
    const result = stripPathPrefix(parent, child)
    assert.equal(result, 'folder/file.js')
  })
})
