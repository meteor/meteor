import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Tinytest } from 'meteor/tinytest'

function createTest (cname, conntype) {
  Tinytest.addAsync(
    `direct - update and remove should allow removing by _id string (${cname}, ${JSON.stringify(
      conntype
    )})`,
    async function (test) {
      // Use Mongo._collections instead of Mongo.Collection.get (no external package needed)
      if (Mongo._collections.get(cname)) return

      const collection = new Mongo.Collection(cname, conntype)
      // Full permissions on collection
      collection.allow({
        insert: function () {
          return true
        },
        update: function () {
          return true
        },
        remove: function () {
          return true
        },
        insertAsync: function () {
          return true
        },
        updateAsync: function () {
          return true
        },
        removeAsync: function () {
          return true
        }
      })

      async function hasCountAndTestValue (count, value) {
        const cursor = await collection.direct.find({
          _id: 'testid',
          test: value
        })
        test.equal(await cursor.countAsync(), count)
      }

      await collection.direct.removeAsync({ _id: 'testid' })
      await collection.direct.insertAsync({ _id: 'testid', test: 1 })

      await hasCountAndTestValue(1, 1)
      await collection.direct.updateAsync('testid', { $set: { test: 2 } })
      await hasCountAndTestValue(1, 2)
      await collection.direct.removeAsync('testid')
      await hasCountAndTestValue(0, 2)
    }
  )
}

// NOTE: failing on client without resolverType: 'stub'
// See: https://github.com/meteor/meteor/issues/13036
createTest('direct_collection_test_stringid0', {
  resolverType: 'stub'
})

// The rest are working
createTest(null, {})
createTest('direct_collection_test_stringid1', { connection: null })
createTest(null, { connection: null })

if (Meteor.isServer) {
  Tinytest.addAsync(
    'direct - Meteor.users.direct.insert should return _id, not an object',
    async function (test) {
      await Meteor.users.removeAsync('directinserttestid')

      const result = await Meteor.users.direct.insertAsync({
        _id: 'directinserttestid',
        test: 1
      })
      test.isFalse(Object(result) === result)
    }
  )
}
