/* eslint-env mocha */

import assert from 'assert'
import getExecutorsFromComments from '../../../../dist/util/executors/getExecutorsFromComments'

describe('getExecutorsFromComments', function () {
  it('returns an empty set for no comments', function () {
    const result = getExecutorsFromComments()
    assert.equal(result.size, 0)
  })

  it('returns executors for no ancestors', function () {
    const comments = [
      {value: 'foo'},
      {value: 'eslint-meteor-env client, server'}
    ]
    const result = getExecutorsFromComments(comments)
    assert.equal(result.size, 3)
    assert.ok(result.has('browser'))
    assert.ok(result.has('server'))
    assert.ok(result.has('cordova'))
  })

  it('returns executors for no ancestors and browser comment', function () {
    const comments = [
      {value: 'foo'},
      {value: 'eslint-meteor-env browser'}
    ]
    const result = getExecutorsFromComments(comments)
    assert.equal(result.size, 1)
    assert.ok(result.has('browser'))
  })

  it('returns executors for no ancestors and cordova comment', function () {
    const comments = [
      {value: 'foo'},
      {value: 'eslint-meteor-env cordova'}
    ]
    const result = getExecutorsFromComments(comments)
    assert.equal(result.size, 1)
    assert.ok(result.has('cordova'))
  })
})
