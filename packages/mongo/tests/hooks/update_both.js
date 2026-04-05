import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Tinytest } from 'meteor/tinytest'
import { InsecureLogin } from './insecure_login'

const collection1 = new Mongo.Collection('test_update_collection1')

if (Meteor.isServer) {
  Tinytest.addAsync('update - collection1 document should have extra property added to it before it is updated', async function (test) {
    const tmp = {}

    async function start () {
      collection1.before.update(function (userId, doc, fieldNames, modifier) {
        // There should be no userId because the update was initiated
        // on the server -- there's no correlation to any specific user
        tmp.userId = userId // HACK: can't test here directly otherwise refreshing test stops execution here
        modifier.$set.before_update_value = true
      })

      await collection1.updateAsync({ start_value: true }, { $set: { update_value: true } }, { multi: true })

      test.equal(await collection1.find({ start_value: true, update_value: true, before_update_value: true }).countAsync(), 2)
      test.equal(tmp.userId, undefined)
    }

    await collection1.removeAsync({})

    // Add two documents
    await collection1.insertAsync({ start_value: true })
    await collection1.insertAsync({ start_value: true })
    await start()
  })
}

const collection2 = new Mongo.Collection('test_update_collection2')

if (Meteor.isServer) {
  // full client-side access
  collection2.allow({
    insert () { return true },
    insertAsync () { return true },
    update () { return true },
    updateAsync () { return true },
    remove () { return true }
  })

  Meteor.methods({
    test_update_reset_collection2 () {
      return collection2.removeAsync({})
    }
  })

  Meteor.publish('test_update_publish_collection2', () => collection2.find())

  collection2.before.update(function (userId, doc, fieldNames, modifier) {
    modifier.$set.server_value = true
  })
}

if (Meteor.isClient) {
  Meteor.subscribe('test_update_publish_collection2')

  Tinytest.addAsync('update - collection2 document should have client-added and server-added extra properties added to it before it is updated', function (test, next) {
    let c = 0
    const n = () => {
      if (++c === 2) {
        next()
      }
    }

    function start (err, id) {
      if (err) throw err

      collection2.before.update(function (userId, doc, fieldNames, modifier) {
        // Insert is initiated on the client, a userId must be present
        test.notEqual(userId, undefined)

        test.equal(fieldNames.length, 1)
        test.equal(fieldNames[0], 'update_value')

        modifier.$set.client_value = true
      })

      collection2.after.update(function (userId, doc, fieldNames, modifier) {
        test.equal(doc.update_value, true)
        test.equal(Object.prototype.hasOwnProperty.call(this.previous, 'update_value'), false)

        n()
      })

      collection2.updateAsync({ _id: id }, { $set: { update_value: true } }).then(async function () {
        await new Promise(resolve => setTimeout(resolve, 100))
        test.equal(collection2.find({ start_value: true, client_value: true, server_value: true }).count(), 1)
        n()
      })
    }

    InsecureLogin.ready(function () {
      Meteor.callAsync('test_update_reset_collection2').then(function () {
        collection2.insert({ start_value: true }, start)
      })
    })
  })
}

if (Meteor.isClient) {
  const collectionForSync = new Mongo.Collection(null)
  Tinytest.add('update - hooks are not called for sync methods', function (test) {
    let beforeCalled = false
    let afterCalled = false
    collectionForSync.before.update(function (userId, selector, options) {
      beforeCalled = true
    })
    collectionForSync.after.update(function (userId, selector, options) {
      afterCalled = true
    })

    const id = collectionForSync.insert({ test: 1 })
    const res = collectionForSync.update({ _id: id }, { $set: { test: 2 } })
    test.equal(res, 1)

    test.equal(beforeCalled, false)
    test.equal(afterCalled, false)
  })
}
