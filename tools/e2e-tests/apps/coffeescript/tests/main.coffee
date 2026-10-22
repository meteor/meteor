import assert from "assert"

describe "react", ->
  it "package.json has correct name", ->
    { name } = await import("../package.json")
    assert.strictEqual(name, "react")

  if Meteor.isClient
    it "client is not server", ->
      assert.strictEqual(Meteor.isServer, false)

  if Meteor.isServer
    it "server is not client", ->
      assert.strictEqual(Meteor.isClient, false)
