import { Meteor } from 'meteor/meteor'
import { Tinytest } from 'meteor/tinytest'

Tinytest.addAsync('insert - Meteor.users collection document should have extra property added before being inserted and properly provide inserted _id in after hook', async function (test) {
  const collection = Meteor.users

  const aspect1 = collection.before.insert(function (nil, doc) {
    if (doc && doc.test) {
      doc.before_insert_value = true
    }
  })

  const aspect2 = collection.after.insert(function (nil, doc) {
    if (doc && doc.test) {
      test.equal(doc._id, this._id)
      test.isFalse(Array.isArray(doc._id))
    }
  })

  const id = await collection.insertAsync({ start_value: true, test: 1 })

  test.notEqual(await collection.find({ start_value: true, before_insert_value: true }).countAsync(), 0)
  await collection.removeAsync({ _id: id })
  aspect1.remove()
  aspect2.remove()
})
