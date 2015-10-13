/* eslint-env mocha */

import assert from 'assert'
import path from 'path'

import ENVIRONMENT from '../../../../dist/util/environment.js'
import getMeteorMeta from '../../../../dist/util/meta/getMeteorMeta.js'


describe('getMeteorMeta', function () {

  describe('when no filename is given', function () {
    it('returns default env', function () {
      const result = getMeteorMeta()
      assert.equal(typeof result, 'object')
      assert.equal(result.env, ENVIRONMENT.NON_METEOR)
    })
  })

  describe('in public', function () {
    it('detects the environment', function () {
      const relativeFilename = path.join('public', 'file.js')
      const result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'public/file.js')
      assert.equal(result.env, ENVIRONMENT.PUBLIC)
    })
  })

  describe('in private', function () {
    it('detects the environment', function () {
      const relativeFilename = path.join('private', 'file.js')
      const result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'private/file.js')
      assert.equal(result.env, ENVIRONMENT.PRIVATE)
    })
  })

  describe('in package', function () {
    it('detects the environment', function () {
      const relativeFilename = path.join('packages', 'awesome-pkg', 'file.js')
      const result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'packages/awesome-pkg/file.js')
      assert.equal(result.env, ENVIRONMENT.PACKAGE)
    })
  })

  describe('in no special folder', function () {
    it('has universal environment', function () {
      const relativeFilename = path.join('file.js')
      const result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'file.js')
      assert.equal(result.env, ENVIRONMENT.UNIVERSAL)
    })
  })

  describe('on client', function () {

    it('returns file info', function () {
      const relativeFilename = path.join('client', 'lib', 'file.js')
      const result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'client/lib/file.js')
      assert.equal(result.env, ENVIRONMENT.CLIENT)
    })

    it('does not detect compatibility when directly in client-folder ', function () {
      const relativeFilename = path.join('client', 'file.js')
      const result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'client/file.js')
      assert.equal(result.env, ENVIRONMENT.CLIENT)
    })

    it('detects compatibility mode', function () {
      const relativeFilename = path.join('client', 'compatibility', 'file.js')
      const result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'client/compatibility/file.js')
      assert.equal(result.env, ENVIRONMENT.COMPATIBILITY)
    })
  })

  describe('on server', function () {
    it('detects the environment', function () {
      const relativeFilename = path.join('server', 'file.js')
      const result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'server/file.js')
      assert.equal(result.env, ENVIRONMENT.SERVER)
    })

    describe('that is nested', function () {
      it('detects the environment', function () {
        const relativeFilename = path.join('lib', 'server', 'file.js')
        const result = getMeteorMeta(relativeFilename)
        assert.equal(typeof result, 'object')
        assert.equal(result.path, 'lib/server/file.js')
        assert.equal(result.env, ENVIRONMENT.SERVER)
      })
    })
  })

  describe('in tests', function () {
    const relativeFilename = path.join('tests', 'file.js')
    const result = getMeteorMeta(relativeFilename)
    assert.equal(typeof result, 'object')
    assert.equal(result.path, 'tests/file.js')
    assert.equal(result.env, ENVIRONMENT.TEST)
  })

  describe('in node_modules', function () {
    const relativeFilename = path.join('node_modules', 'my-module', 'file.js')
    const result = getMeteorMeta(relativeFilename)
    assert.equal(typeof result, 'object')
    assert.equal(result.path, 'node_modules/my-module/file.js')
    assert.equal(result.env, ENVIRONMENT.NODE_MODULE)
  })

  describe('mobile-config.js', function () {
    it('is detected', function () {
      const relativeFilename = path.join('mobile-config.js')
      const result = getMeteorMeta(relativeFilename)
      assert.equal(result.env, ENVIRONMENT.MOBILE_CONFIG)
    })

    it('is not detected', function () {
      const relativeFilename = path.join('sub', 'mobile-config.js')
      const result = getMeteorMeta(relativeFilename)

      assert.equal(result.env, ENVIRONMENT.UNIVERSAL)
    })
  })

  describe('package.js', function () {
    it('is detected', function () {
      const relativeFilename = path.join('packages', 'my-module', 'package.js')
      const result = getMeteorMeta(relativeFilename)

      assert.equal(result.env, ENVIRONMENT.PACKAGE_CONFIG)
    })

    it('is not detected', function () {
      const relativeFilename = path.join('packages', 'package.js')
      const result = getMeteorMeta(relativeFilename)

      assert.equal(result.env, ENVIRONMENT.UNIVERSAL)
    })
  })
})
