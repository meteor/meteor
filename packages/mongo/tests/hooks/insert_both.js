import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Tinytest } from 'meteor/tinytest'
import { InsecureLogin } from './insecure_login'

if (Meteor.isServer) {
  const collection1 = new Mongo.Collection('test_insert_collection1')

  Tinytest.addAsync(
    'insert - collection1 document should have extra property added to it before it is inserted',
    async function (test, next) {
      const tmp = {}

      await collection1.removeAsync({})

      collection1.before.insert(async function (userId, doc) {
        // There should be no userId because the insert was initiated
        // on the server -- there's no correlation to any specific user
        tmp.userId = userId // HACK: can't test here directly otherwise refreshing test stops execution here
        doc.before_insert_value = true
      })

      await collection1.insertAsync({ start_value: true })

      test.equal(
        await collection1
          .find({ start_value: true, before_insert_value: true })
          .countAsync(),
        1
      )
      test.equal(tmp.userId, undefined)

      next()
    }
  )
}

const collection2 = new Mongo.Collection('test_insert_collection2')

if (Meteor.isServer) {
  // full client-side access
  collection2.allow({
    insert () {
      return true
    },
    insertAsync () {
      return true
    },
    update () {
      return true
    },
    remove () {
      return true
    }
  })

  Meteor.methods({
    test_insert_reset_collection2: function () {
      return collection2.removeAsync({})
    }
  })

  Meteor.publish('test_insert_publish_collection2', function () {
    return collection2.find()
  })

  collection2.before.insert(function (userId, doc) {
    doc.server_value = true
  })
}

if (Meteor.isClient) {
  Meteor.subscribe('test_insert_publish_collection2')

  Tinytest.addAsync(
    'insert - collection2 document on client should have client-added and server-added extra properties added to it before it is inserted',
    async function (test) {
      collection2.before.insert(function (userId, doc) {
        test.notEqual(
          userId,
          undefined,
          'the userId should be present since we are on the client'
        )
        test.equal(
          collection2.find({ start_value: true }).count(),
          0,
          'collection2 should not have the test document in it'
        )
        doc.client_value = true
      })

      collection2.after.insert(function (userId, doc) {
        test.notEqual(
          this._id,
          undefined,
          'the _id should be available on this'
        )
      })

      await InsecureLogin.ready(async function () {
        await Meteor.callAsync('test_insert_reset_collection2')
        await collection2.insertAsync({ start_value: true })

        test.equal(
          collection2
            .find({
              start_value: true,
              client_value: true,
              server_value: true
            })
            .count(),
          1,
          'collection2 should have the test document with client_value AND server_value in it'
        )
      })
    }
  )
}

if (Meteor.isClient) {
  const collectionForSync = new Mongo.Collection(null)
  Tinytest.add('insert - hooks are not called for sync methods', function (test) {
    let beforeCalled = false
    let afterCalled = false
    collectionForSync.before.insert(function (userId, selector, options) {
      beforeCalled = true
    })
    collectionForSync.after.insert(function (userId, selector, options) {
      afterCalled = true
    })

    const res = collectionForSync.insert({ test: 1 })
    test.equal(typeof res, 'string')

    test.equal(beforeCalled, false)
    test.equal(afterCalled, false)
  })
}
