/* eslint-env mocha */

import assert from 'assert'
import getEnvFromComments from '../../../../dist/util/meta/getEnvFromComments'
import {UNIVERSAL, CLIENT, SERVER} from '../../../../dist/util/environment'

describe('getEnvFromComments', function () {
  it('returns false for no comments', function () {
    const result = getEnvFromComments()
    assert.equal(result, false)
  })

  it('returns executors for no ancestors', function () {
    const comments = [
      {value: 'foo'},
      {value: 'eslint-meteor-env client, server'}
    ]
    const result = getEnvFromComments(comments)
    assert.equal(result, UNIVERSAL)
  })

  it('returns executors for no ancestors and browser comment', function () {
    const comments = [
      {value: 'foo'},
      {value: 'eslint-meteor-env client'}
    ]
    const result = getEnvFromComments(comments)
    assert.equal(result, CLIENT)
  })

  it('returns executors for no ancestors and cordova comment', function () {
    const comments = [
      {value: 'foo'},
      {value: 'eslint-meteor-env server'}
    ]
    const result = getEnvFromComments(comments)
    assert.equal(result, SERVER)
  })
})
