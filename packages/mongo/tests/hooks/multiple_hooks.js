import { Mongo } from 'meteor/mongo'
import { Tinytest } from 'meteor/tinytest'
import { InsecureLogin } from './insecure_login'

Tinytest.addAsync('general - multiple hooks should all fire the appropriate number of times', async function (test) {
  const collection = new Mongo.Collection(null)
  const counts = {
    before: {
      insert: 0,
      update: 0,
      remove: 0
    },
    after: {
      insert: 0,
      update: 0,
      remove: 0
    }
  }

  collection.before.insert(function () { counts.before.insert++ })
  collection.before.update(function () { counts.before.update++ })
  collection.before.remove(function () { counts.before.remove++ })

  collection.before.insert(function () { counts.before.insert++ })
  collection.before.update(function () { counts.before.update++ })
  collection.before.remove(function () { counts.before.remove++ })

  collection.after.insert(function () { counts.after.insert++ })
  collection.after.update(function () { counts.after.update++ })
  collection.after.remove(function () { counts.after.remove++ })

  collection.after.insert(function () { counts.after.insert++ })
  collection.after.update(function () { counts.after.update++ })
  collection.after.remove(function () { counts.after.remove++ })

  await InsecureLogin.ready(async function () {
    const id = await collection.insertAsync({ start_value: true })
    await collection.updateAsync({ start_value: true }, { $set: {} })

    await collection.removeAsync({ _id: id })

    test.equal(counts.before.insert, 2)
    test.equal(counts.before.update, 2)
    test.equal(counts.before.remove, 2)
    test.equal(counts.after.insert, 2)
    test.equal(counts.after.update, 2)
    test.equal(counts.after.remove, 2)
  })
})
