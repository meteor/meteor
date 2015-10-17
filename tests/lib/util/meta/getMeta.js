/* eslint-env mocha */

import assert from 'assert'
import {CLIENT, SERVER, NON_METEOR} from '../../../../dist/util/environment'

const rewire = require('rewire')
const getMeta = rewire('../../../../dist/util/meta/getMeta')
getMeta.__set__('memoizedGetRelativePath', function (path) {
  return path === '<input>' ? false : path
})

describe('getMeta', function () {
  it('returns information when a filename is set', function () {
    const context = {
      getFilename () {
        return 'client/index1.js'
      },
      getSourceCode () {
        return {
          getAllComments () {
            return []
          }
        }
      }
    }
    const result = getMeta(context)
    assert.equal(typeof result, 'object')
    assert.equal(result.env, CLIENT)
  })

  it('overwrites the env with the one from comments', function () {
    const context = {
      getFilename () {
        return 'client/index2.js'
      },
      getSourceCode () {
        return {
          getAllComments () {
            return [{value: 'eslint-meteor-env server'}]
          }
        }
      }
    }
    const result = getMeta(context)
    assert.equal(typeof result, 'object')
    assert.equal(result.env, SERVER)
  })

  it('returns no Meteor env when filename is unknown', function () {
    const context = {
      getFilename () {
        return '<input>'
      },
      getSourceCode () {
        return {
          getAllComments () {
            return []
          }
        }
      }
    }
    const result = getMeta(context)
    assert.equal(typeof result, 'object')
    assert.equal(result.env, NON_METEOR)
  })
})
