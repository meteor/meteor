/* eslint-env mocha */

import assert from 'assert'
import {CLIENT, SERVER, NON_METEOR} from '../../../../dist/util/environment'

const rewire = require('rewire')
const getMeta = rewire('../../../../dist/util/meta/getMeta')
getMeta.__set__('memoizedGetRelativePath', function (path) {
  return path === '<input>' ? false : path
})
getMeta.__set__('process', {
  cwd: function () {
    return '/Users/foo/project/client'
  }
})

describe('getMeta', function () {
  it('returns information when a filename is set', function () {
    const context = {
      getFilename () {
        return '/User/foo/project/client/index1.js'
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
        return '/User/foo/project/client/index2.js'
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

  it('uses the working directory in SublimeLinter', function () {
    const context = {
      getFilename () {
        return 'client/index3.js'
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
})
