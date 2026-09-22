import { Meteor } from 'meteor/meteor'
import assert from 'assert'

describe '~name~', ->
  it 'package.json has correct name', ->
    packageJson = require('../package.json')
    assert.strictEqual(packageJson.name, '~name~')

  if Meteor.isClient
    it 'client is not server', ->
      assert.strictEqual(Meteor.isServer, false)

  if Meteor.isServer
    it 'server is not client', ->
      assert.strictEqual(Meteor.isClient, false)
