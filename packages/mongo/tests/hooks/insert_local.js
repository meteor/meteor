import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Tinytest } from 'meteor/tinytest'
import { InsecureLogin } from './insecure_login'

Tinytest.addAsync('insert - local collection document should have extra property added before being inserted', async function (test) {
  const collection = new Mongo.Collection(null)
  const tmp = {}

  collection.before.insert(function (userId, doc) {
    tmp.typeof_userId = typeof userId
    doc.before_insert_value = true
  })

  await InsecureLogin.ready(async function () {
    await collection.insertAsync({ start_value: true })

    if (Meteor.isServer) {
      test.equal(tmp.typeof_userId, 'undefined', 'Local collection on server should NOT know about a userId')
    } else {
      test.equal(tmp.typeof_userId, 'string', 'There should be a userId on the client')
    }
    test.equal(await collection.find({ start_value: true, before_insert_value: true }).countAsync(), 1)
  })
})

Tinytest.addAsync('insert - local collection should fire after-insert hook', async function (test) {
  const collection = new Mongo.Collection(null)

  collection.after.insert(function (userId, doc) {
    if (Meteor.isServer) {
      test.equal(typeof userId, 'undefined', 'Local collection on server should NOT know about a userId')
    } else {
      test.equal(typeof userId, 'string', 'There should be a userId on the client')
    }

    test.notEqual(doc.start_value, undefined, 'doc should have start_value')
    test.notEqual(this._id, undefined, 'should provide inserted _id on this')
  })

  await InsecureLogin.ready(async function () {
    await collection.insertAsync({ start_value: true })
  })
})
