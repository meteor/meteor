/* eslint-env mocha */

import assert from 'assert'
import getExecutors from '../../../../dist/util/executors/getExecutors'
import {UNIVERSAL} from '../../../../dist/util/environment'

describe('getExecutors', function () {
  it('returns executors for no ancestors', function () {
    const result = getExecutors(UNIVERSAL, [])
    assert.equal(result.size, 3)
    assert.ok(result.has('browser'))
    assert.ok(result.has('server'))
    assert.ok(result.has('cordova'))
  })
})
