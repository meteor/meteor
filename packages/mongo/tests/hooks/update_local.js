import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Tinytest } from 'meteor/tinytest'
import { InsecureLogin } from './insecure_login'

Tinytest.addAsync(
  'update - local collection documents should have extra property added before being updated',
  async function (test) {
    const collection = new Mongo.Collection(null)

    async function start () {
      collection.before.update(function (userId, doc, fieldNames, modifier) {
        if (Meteor.isServer) {
          test.equal(userId, undefined)
        } else {
          test.notEqual(userId, undefined)
        }

        test.equal(fieldNames.length, 1)
        test.equal(fieldNames[0], 'update_value')

        modifier.$set.before_update_value = true
      })

      await collection.updateAsync(
        { start_value: true },
        { $set: { update_value: true } },
        { multi: true }
      )

      test.equal(
        collection
          .find({
            start_value: true,
            update_value: true,
            before_update_value: true
          })
          .count(),
        2
      )
    }

    await InsecureLogin.ready(async function () {
      // Add two documents
      await collection.insertAsync({ start_value: true })
      await collection.insertAsync({ start_value: true })

      await start()
    })
  }
)

Tinytest.addAsync(
  'update - local collection should fire after-update hook',
  async function (test) {
    const collection = new Mongo.Collection(null)

    async function start () {
      collection.after.update(function (userId, doc, fieldNames, modifier) {
        if (Meteor.isServer) {
          test.equal(userId, undefined)
        } else {
          test.notEqual(userId, undefined)
        }

        test.equal(fieldNames.length, 1)
        test.equal(fieldNames[0], 'update_value')

        test.equal(doc.update_value, true)
        test.equal(
          Object.prototype.hasOwnProperty.call(this.previous, 'update_value'),
          false
        )
      })

      await collection.updateAsync(
        { start_value: true },
        { $set: { update_value: true } },
        { multi: true }
      )
    }

    await InsecureLogin.ready(async function () {
      // Add two documents
      await collection.insertAsync({ start_value: true })
      await collection.insertAsync({ start_value: true })
      await start()
    })
  }
)

Tinytest.addAsync(
  'update - local collection should fire before-update hook without options in update and still fire end-callback',
  async function (test) {
    const collection = new Mongo.Collection(null)

    async function start () {
      collection.before.update(function (userId, doc, fieldNames, modifier) {
        modifier.$set.before_update_value = true
      })

      await collection.updateAsync(
        { start_value: true },
        { $set: { update_value: true } }
      )

      test.equal(
        await collection
          .find({
            start_value: true,
            update_value: true,
            before_update_value: true
          })
          .countAsync(),
        1
      )
    }

    await InsecureLogin.ready(async function () {
      await collection.insertAsync({ start_value: true })
      await start()
    })
  }
)

Tinytest.addAsync(
  'update - local collection should fire after-update hook without options in update and still fire end-callback',
  async function (test) {
    const collection = new Mongo.Collection(null)
    let c = 0
    const n = () => {
      ++c
    }

    async function start () {
      collection.after.update(function (userId, doc, fieldNames, modifier) {
        n()
      })

      await collection.updateAsync(
        { start_value: true },
        { $set: { update_value: true } }
      )

      // Expect hook to be called
      test.equal(c, 1)
    }

    await InsecureLogin.ready(async function () {
      await collection.insertAsync({ start_value: true })
      await start()
    })
  }
)

Tinytest.addAsync(
  'update - no previous document should be present if fetchPrevious is false',
  async function (test) {
    const collection = new Mongo.Collection(null)

    async function start () {
      collection.after.update(
        function (userId, doc, fieldNames, modifier) {
          test.equal(this.previous, undefined)
        },
        { fetchPrevious: false }
      )

      await collection.updateAsync(
        { start_value: true },
        { $set: { update_value: true } },
        { multi: true }
      )
    }

    await InsecureLogin.ready(async function () {
      await collection.insertAsync({ start_value: true })
      await collection.insertAsync({ start_value: true })
      await start()
    })
  }
)

Tinytest.addAsync(
  'update - a previous document should be present if fetchPrevious is true',
  async function (test) {
    const collection = new Mongo.Collection(null)

    async function start () {
      collection.after.update(
        function (userId, doc, fieldNames, modifier) {
          test.notEqual(this.previous, undefined, 'previous must be an object')
          test.notEqual(this.previous.start_value, undefined)
        },
        { fetchPrevious: true }
      )

      await collection.updateAsync(
        { start_value: true },
        { $set: { update_value: true } },
        { multi: true }
      )
    }

    await InsecureLogin.ready(async function () {
      await collection.insertAsync({ start_value: true })
      await collection.insertAsync({ start_value: true })
      await start()
    })
  }
)

Tinytest.addAsync(
  'update - a previous document should be present if fetchPrevious is true, but only requested fields if present',
  async function (test) {
    const collection = new Mongo.Collection(null)

    async function start () {
      collection.after.update(
        function (userId, doc, fieldNames, modifier) {
          test.notEqual(this.previous, undefined)
          test.notEqual(this.previous.start_value, undefined)
          test.equal(this.previous.another_value, undefined)
        },
        { fetchPrevious: true, fetchFields: { start_value: true } }
      )

      await collection.updateAsync(
        { start_value: true },
        { $set: { update_value: true } },
        { multi: true }
      )
    }

    await InsecureLogin.ready(async function () {
      await collection.insertAsync({ start_value: true, another_value: true })
      await collection.insertAsync({ start_value: true, another_value: true })
      await start()
    })
  }
)
