import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Tinytest } from 'meteor/tinytest'
import { InsecureLogin } from './insecure_login'

const collection = new Mongo.Collection('test_remove_allow_collection')

if (Meteor.isServer) {
  // full client-side access
  collection.allow({
    insertAsync () { return true },
    updateAsync () { return true },
    remove (userId, doc) { return doc.allowed },
    removeAsync (userId, doc) { return doc.allowed }
  })

  Meteor.methods({
    test_remove_allow_reset_collection: function () {
      return collection.removeAsync({})
    }
  })

  Meteor.publish('test_remove_allow_publish_collection', function () {
    return collection.find()
  })
}

if (Meteor.isClient) {
  Meteor.subscribe('test_remove_allow_publish_collection')

  Tinytest.addAsync('remove - only one of two collection documents should be allowed to be removed', async function (test) {
    collection.before.remove(function (userId, doc) {
      test.equal(doc.start_value, true)
    })

    await InsecureLogin.ready(async function () {
      await Meteor.callAsync('test_remove_allow_reset_collection')

      const id1 = await collection.insertAsync({ start_value: true, allowed: true })
      const id2 = await collection.insertAsync({ start_value: true, allowed: false })
      await collection.removeAsync({ _id: id1 })
      test.equal(collection.findOne({ _id: id1 }), undefined)
      try {
        await collection.removeAsync({ _id: id2 })
        test.equal(collection.findOne({ _id: id2 }), { _id: id2, start_value: true, allowed: false })
        test.fail('should not be allowed to remove')
      } catch (e) {
        // just ignore the error - it is expected
      }
    })
  })
}
