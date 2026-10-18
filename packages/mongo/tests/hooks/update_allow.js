import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Tinytest } from 'meteor/tinytest'
import { InsecureLogin } from './insecure_login'

const collection = new Mongo.Collection('test_update_allow_collection')

if (Meteor.isServer) {
  // full client-side access
  collection.allow({
    insert () { return true },
    insertAsync () { return true },
    update (userId, doc, fieldNames, modifier) { return modifier.$set.allowed },
    updateAsync (userId, doc, fieldNames, modifier) {
      return modifier.$set.allowed
    },
    remove () { return true }
  })

  Meteor.methods({
    test_update_allow_reset_collection: function () {
      return collection.removeAsync({})
    }
  })

  Meteor.publish('test_update_allow_publish_collection', function () {
    return collection.find()
  })

  collection.before.update(function (userId, doc, fieldNames, modifier) {
    modifier.$set.server_value = true
  })
}

if (Meteor.isClient) {
  Meteor.subscribe('test_update_allow_publish_collection')

  Tinytest.addAsync('update - only one of two collection documents should be allowed to be updated, and should carry the extra server and client properties', async function (test) {
    collection.before.update(async function (userId, doc, fieldNames, modifier) {
      modifier.$set.client_value = true
    })

    await InsecureLogin.ready(async function () {
      await Meteor.callAsync('test_update_allow_reset_collection')

      const id1 = await collection.insertAsync({ start_value: true })
      const id2 = await collection.insertAsync({ start_value: true })

      await collection.updateAsync({ _id: id1 }, { $set: { update_value: true, allowed: true } })
      try {
        await collection.updateAsync({ _id: id2 }, { $set: { update_value: true, allowed: false } })
        test.fail('should not be allowed to update')
      } catch (e) {
        test.equal(collection.find({ start_value: true, update_value: true, client_value: true, server_value: true }).count(), 1)
      }
    })
  })
}
