import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Tinytest } from 'meteor/tinytest'

const testUsers = new Mongo.Collection('test_insert_user_collection')
const collection1 = new Mongo.Collection('test_insert_mongoid_collection1', { idGeneration: 'MONGO' })

if (Meteor.isServer) {
  testUsers.allow({
    insertAsync: function () { return true },
    removeAsync: function () { return true }
  })
  collection1.allow({
    insertAsync: function () { return true },
    removeAsync: function () { return true }
  })
}

Tinytest.addAsync('meteor_1_4_id_object - after insert hooks should be able to cope with object _id with ops property in Meteor 1.4', async function (test) {
  const key = Date.now()
  const aspect1 = testUsers.after.insert(function (nil, doc) {
    if (doc && doc.key && doc.key === key) {
      test.equal(doc._id, this._id)
      test.isFalse(Object(doc._id) === doc._id, '_id property should not be an object')
    }
  })
  let id

  try {
    id = await testUsers.insertAsync({ key })
  } finally {
    aspect1.remove()
    if (id) {
      await testUsers.removeAsync({ _id: id })
    }
  }
})

Tinytest.addAsync('meteor_1_4_id_object - after insert hooks should be able to cope with Mongo.ObjectID _id with _str property in Meteor 1.4', async function (test) {
  const key = Date.now()
  const aspect1 = collection1.after.insert(async function (nil, doc) {
    if (doc && doc.key && doc.key === key) {
      let foundDoc = null
      try {
        foundDoc = await collection1.direct.findOneAsync({ _id: doc._id })
      } catch (exception) {}
      test.isNotNull(foundDoc)
    }
  })
  let id

  try {
    id = await collection1.insertAsync({ key })
  } finally {
    aspect1.remove()
    if (id) {
      await collection1.removeAsync({ _id: id })
    }
  }
})
