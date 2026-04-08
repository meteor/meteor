import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Tinytest } from 'meteor/tinytest'

Tinytest.addAsync('update - server collection documents should have extra properties added before and after being updated despite selector not being _id', async function (test) {
  const collection = new Mongo.Collection(null)

  let retries = 0
  const retry = function (func, expect) {
    if (++retries >= 5) {
      return Promise.reject(new Error('retry timeout'))
    }

    return new Promise((resolve, reject) => {
      Meteor.setTimeout(function () {
        const r = func()
        if (expect(r)) return resolve(r)
        return retry(func, expect).then(resolve, reject)
      }, 100)
    })
  }

  collection.before.update(function (userId, doc, fieldNames, modifier, options) {
    if (fieldNames.includes('test')) {
      modifier.$set.before_update_value = true
    }
  })

  collection.after.update(function (userId, doc, fieldNames, modifier, options) {
    if (fieldNames.includes('test')) {
      collection.update({ _id: doc._id }, { $set: { after_update_value: true } })
    }
  })

  await collection.insertAsync({ not_an_id: 'testing' })
  await collection.insertAsync({ not_an_id: 'testing' })
  await collection.insertAsync({ not_an_id: 'testing' })

  await collection.updateAsync({ not_an_id: 'testing' }, { $set: { not_an_id: 'newvalue', test: true } }, { multi: true })
  const expectedCount = 3

  // retry a few times because the after.update's call to update doesn't block
  const r = await retry(function () {
    return collection.find({ not_an_id: 'newvalue', before_update_value: true, after_update_value: true }).count()
  }, function (r) {
    return r === expectedCount
  })

  test.equal(r, expectedCount, 'number of docs found should be 3')
})
