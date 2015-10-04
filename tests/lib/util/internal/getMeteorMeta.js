/* eslint-env mocha */

import assert from 'assert'
import path from 'path'

import ENVIRONMENT from '../../../../dist/util/environment.js'
import getMeteorMeta from '../../../../dist/util/internal/getMeteorMeta.js'


describe('getMeteorMeta', function () {

  describe('when no filename is given', function () {
    it('returns default env', function () {
      var result = getMeteorMeta()
      assert.equal(typeof result, 'object')
      assert.equal(result.isInMeteorProject, false)
      assert.equal(Object.keys(result).length, 1)
    })
  })

  describe('in public', function () {
    it('detects the environment', function () {
      var relativeFilename = path.join('public', 'file.js')
      var result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'public/file.js')
      assert.equal(result.env, ENVIRONMENT.PUBLIC)
      assert.equal(result.isCompatibilityFile, false)
      assert.equal(result.isInMeteorProject, true)
    })
  })

  describe('in private', function () {
    it('detects the environment', function () {
      var relativeFilename = path.join('private', 'file.js')
      var result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'private/file.js')
      assert.equal(result.env, ENVIRONMENT.PRIVATE)
      assert.equal(result.isCompatibilityFile, false)
      assert.equal(result.isInMeteorProject, true)
    })
  })

  describe('in package', function () {
    it('detects the environment', function () {
      var relativeFilename = path.join('packages', 'awesome-pkg', 'file.js')
      var result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'packages/awesome-pkg/file.js')
      assert.equal(result.env, ENVIRONMENT.PACKAGE)
      assert.equal(result.isCompatibilityFile, false)
      assert.equal(result.isInMeteorProject, true)
    })
  })

  describe('on no special folder', function () {
    it('has universal environment', function () {
      var relativeFilename = path.join('file.js')
      var result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'file.js')
      assert.equal(result.env, ENVIRONMENT.UNIVERSAL)
      assert.equal(result.isCompatibilityFile, false)
      assert.equal(result.isInMeteorProject, true)
    })
  })

  describe('on client', function () {

    it('returns file info', function () {
      var relativeFilename = path.join('client', 'lib', 'file.js')
      var result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'client/lib/file.js')
      assert.equal(result.env, ENVIRONMENT.CLIENT)
      assert.equal(result.isCompatibilityFile, false)
      assert.equal(result.isInMeteorProject, true)
    })

    it('does not detect compatibility when directly in client-folder ', function () {
      var relativeFilename = path.join('client', 'file.js')
      var result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'client/file.js')
      assert.equal(result.env, ENVIRONMENT.CLIENT)
      assert.equal(result.isCompatibilityFile, false)
      assert.equal(result.isInMeteorProject, true)
    })

    it('detects compatibility mode', function () {
      var relativeFilename = path.join('client', 'compatibility', 'file.js')
      var result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'client/compatibility/file.js')
      assert.equal(result.env, ENVIRONMENT.CLIENT)
      assert.equal(result.isCompatibilityFile, true)
      assert.equal(result.isInMeteorProject, true)
    })
  })

  describe('on server', function () {
    it('detects the environment', function () {
      var relativeFilename = path.join('server', 'file.js')
      var result = getMeteorMeta(relativeFilename)
      assert.equal(typeof result, 'object')
      assert.equal(result.path, 'server/file.js')
      assert.equal(result.env, ENVIRONMENT.SERVER)
      assert.equal(result.isCompatibilityFile, false)
      assert.equal(result.isInMeteorProject, true)
    })

    describe('that is nested', function () {
      it('detects the environment', function () {
        var relativeFilename = path.join('lib', 'server', 'file.js')
        var result = getMeteorMeta(relativeFilename)
        assert.equal(typeof result, 'object')
        assert.equal(result.path, 'lib/server/file.js')
        assert.equal(result.env, ENVIRONMENT.SERVER)
        assert.equal(result.isCompatibilityFile, false)
        assert.equal(result.isInMeteorProject, true)
      })
    })
  })

  describe('in tests', function () {
    var relativeFilename = path.join('tests', 'file.js')
    var result = getMeteorMeta(relativeFilename)
    assert.equal(typeof result, 'object')
    assert.equal(result.path, 'tests/file.js')
    assert.equal(result.env, ENVIRONMENT.TEST)
    assert.equal(result.isCompatibilityFile, false)
    assert.equal(result.isInMeteorProject, true)
  })

  describe('in node_modules', function () {
    var relativeFilename = path.join('node_modules', 'my-module', 'file.js')
    var result = getMeteorMeta(relativeFilename)
    assert.equal(typeof result, 'object')
    assert.equal(result.path, 'node_modules/my-module/file.js')
    assert.equal(result.env, ENVIRONMENT.NODE_MODULE)
    assert.equal(result.isCompatibilityFile, false)
    assert.equal(result.isInMeteorProject, true)
  })

  describe('mobile-config.js', function () {
    it('is detected', function () {
      var relativeFilename = path.join('mobile-config.js')
      var result = getMeteorMeta(relativeFilename)

      assert.equal(result.isMobileConfig, true)
    })

    it('is not detected', function () {
      var relativeFilename = path.join('sub', 'mobile-config.js')
      var result = getMeteorMeta(relativeFilename)

      assert.equal(result.isMobileConfig, false)
    })
  })

  describe('package.js', function () {
    it('is detected', function () {
      var relativeFilename = path.join('packages', 'my-module', 'package.js')
      var result = getMeteorMeta(relativeFilename)

      assert.equal(result.isPackageConfig, true)
    })

    it('is not detected', function () {
      var relativeFilename = path.join('packages', 'package.js')
      var result = getMeteorMeta(relativeFilename)

      assert.equal(result.isPackageConfig, false)
    })
  })


})
