/* eslint-env mocha */

import assert from 'assert'
import getExecutorsByEnv from '../../../../dist/util/executors/getExecutorsByEnv'

import {
  PUBLIC,
  PRIVATE,
  CLIENT,
  SERVER,
  PACKAGE,
  TEST,
  NODE_MODULE,
  UNIVERSAL,
  PACKAGE_CONFIG,
  MOBILE_CONFIG,
  COMPATIBILITY,
  NON_METEOR
} from '../../../../dist/util/environment'

describe('getExecutorsByEnv', function () {
  it('public', function () {
    const result = getExecutorsByEnv(PUBLIC)
    assert.equal(result.size, 0)
  })
  it('private', function () {
    const result = getExecutorsByEnv(PRIVATE)
    assert.equal(result.size, 0)
  })
  it('client', function () {
    const result = getExecutorsByEnv(CLIENT)
    assert.equal(result.size, 2)
    assert.ok(result.has('browser'))
    assert.ok(result.has('cordova'))
  })
  it('server', function () {
    const result = getExecutorsByEnv(SERVER)
    assert.equal(result.size, 1)
    assert.ok(result.has('server'))
  })
  it('package', function () {
    const result = getExecutorsByEnv(PACKAGE)
    assert.equal(result.size, 0)
  })
  it('test', function () {
    const result = getExecutorsByEnv(TEST)
    assert.equal(result.size, 0)
  })
  it('node_module', function () {
    const result = getExecutorsByEnv(NODE_MODULE)
    assert.equal(result.size, 0)
  })
  it('universal', function () {
    const result = getExecutorsByEnv(UNIVERSAL)
    assert.equal(result.size, 3)
    assert.ok(result.has('browser'))
    assert.ok(result.has('server'))
    assert.ok(result.has('cordova'))
  })
  it('packageConfig', function () {
    const result = getExecutorsByEnv(PACKAGE_CONFIG)
    assert.equal(result.size, 1)
    assert.ok(result.has('isobuild'))
  })
  it('mobileConfig', function () {
    const result = getExecutorsByEnv(MOBILE_CONFIG)
    assert.equal(result.size, 1)
    assert.ok(result.has('isobuild'))
  })
  it('compatibility', function () {
    const result = getExecutorsByEnv(COMPATIBILITY)
    assert.equal(result.size, 2)
    assert.ok(result.has('cordova'))
    assert.ok(result.has('browser'))
  })
  it('nonMeteor', function () {
    const result = getExecutorsByEnv(NON_METEOR)
    assert.equal(result.size, 0)
  })
})
