/* eslint-env mocha */

import assert from 'assert'
import getExecutors from '../../../../dist/util/executors/getExecutors'
import {UNIVERSAL} from '../../../../dist/util/environment'

describe('getExecutors', function () {
  it('returns executors for no ancestors and no comments', function () {
    const context = {
      getAncestors () {
        return []
      },
      getSourceCode () {
        return {
          getAllComments () {
            return []
          }
        }
      }
    }
    const result = getExecutors(UNIVERSAL, context)
    assert.equal(result.size, 3)
    assert.ok(result.has('browser'))
    assert.ok(result.has('server'))
    assert.ok(result.has('cordova'))
  })

  it('returns executors for no ancestors and a comment', function () {
    const context = {
      getAncestors () {
        return []
      },
      getSourceCode () {
        return {
          getAllComments () {
            return [
              {value: 'eslint-meteor-env client'}
            ]
          }
        }
      }
    }
    const result = getExecutors(UNIVERSAL, context)
    assert.equal(result.size, 2)
    assert.ok(result.has('browser'))
    assert.ok(result.has('cordova'))
  })
})
