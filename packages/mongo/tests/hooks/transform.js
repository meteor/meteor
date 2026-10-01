import { Mongo } from 'meteor/mongo'
import { Tinytest } from 'meteor/tinytest'
import { InsecureLogin } from './insecure_login'

const isFunction = (fn) => typeof fn === 'function'

Tinytest.addAsync('general - hook callbacks should have this.transform function that works', async function (test) {
  const collection = new Mongo.Collection(null, {
    transform: doc => ({ ...doc, isTransformed: true })
  })

  collection.allow({
    insert () { return true },
    update () { return true },
    remove () { return true }
  })

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

  collection.before.insert(function (userId, doc) { if (isFunction(this.transform) && this.transform().isTransformed) { counts.before.insert++ } })
  collection.before.update(function (userId, doc) { if (isFunction(this.transform) && this.transform().isTransformed) { counts.before.update++ } })
  collection.before.remove(function (userId, doc) { if (isFunction(this.transform) && this.transform().isTransformed) { counts.before.remove++ } })

  collection.after.insert(function (userId, doc) { if (isFunction(this.transform) && this.transform().isTransformed) { counts.after.insert++ } })
  collection.after.update(function (userId, doc) { if (isFunction(this.transform) && this.transform().isTransformed) { counts.after.update++ } })
  collection.after.remove(function (userId, doc) { if (isFunction(this.transform) && this.transform().isTransformed) { counts.after.remove++ } })

  await InsecureLogin.ready(async function () {
    const id = await collection.insertAsync({ _id: '1', start_value: true })

    await collection.updateAsync({ _id: id }, { $set: { update_value: true } })
    await collection.removeAsync({ _id: id })

    test.equal(counts.before.insert, 1, 'before insert should have 1 count')
    test.equal(counts.before.update, 1, 'before update should have 1 count')
    test.equal(counts.before.remove, 1, 'before remove should have 1 count')
    test.equal(counts.after.insert, 1, 'after insert should have 1 count')
    test.equal(counts.after.update, 1, 'after update should have 1 count')
    test.equal(counts.after.remove, 1, 'after remove should have 1 count')
  })
})
