import { Meteor } from 'meteor/meteor'
import { Mongo, CollectionHooks } from 'meteor/mongo'
import { Tinytest } from 'meteor/tinytest'

async function withDebugCapture (fn) {
  const messages = []
  const originalDebug = Meteor._debug
  Meteor._debug = (...args) => { messages.push(args.join(' ')) }
  try {
    await fn(messages)
  } finally {
    Meteor._debug = originalDebug
  }
}

Tinytest.addAsync('core - hooks receive the collection and arguments as this.context and this.args', async function (test) {
  const collection = new Mongo.Collection(null)
  let context

  collection.before.insert(function (userId, doc) {
    context = this
  })

  await collection.insertAsync({ value: 1 })

  test.isTrue(context.context === collection)
  test.equal(context.args.length, 1)
  test.equal(context.args[0].value, 1)
})

Tinytest.addAsync('core - insertAsync dispatches synchronously when hooks are synchronous', async function (test) {
  const collection = new Mongo.Collection(null)

  collection.before.insert(function (userId, doc) {
    doc.before = true
  })
  collection.after.insert(function () {})

  const promise = collection.insertAsync({ _id: 'sync-dispatch' })
  const doc = collection.findOne('sync-dispatch')

  test.isTrue(!!doc, 'document should be inserted before the promise is awaited')
  test.equal(doc && doc.before, true)
  test.equal(await promise, 'sync-dispatch')
})

Tinytest.addAsync('core - upsertAsync without multi fires after.update for one document', async function (test) {
  const collection = new Mongo.Collection(null)
  await collection.insertAsync({ group: 'a' })
  await collection.insertAsync({ group: 'a' })

  const updatedIds = []
  collection.after.update(function (userId, doc) {
    updatedIds.push(doc._id)
  })

  const result = await collection.upsertAsync({ group: 'a' }, { $set: { touched: true } })

  test.equal(result.numberAffected, 1)
  test.equal(updatedIds.length, 1)
  test.equal(await collection.find({ touched: true }).countAsync(), 1)
})

Tinytest.addAsync('core - sync mutators warn once that they skip hooks', async function (test) {
  const collection = new Mongo.Collection(null)
  collection.before.insert(function () {})

  await withDebugCapture(async (messages) => {
    collection.insert({ value: 1 })
    collection.insert({ value: 2 })

    test.equal(messages.length, 1)
    test.isTrue(messages[0] && messages[0].includes('insertAsync()'))
  })
})

Tinytest.addAsync('core - built-in hooks are disabled when matb33:collection-hooks is installed', async function (test) {
  const collection = new Mongo.Collection(null)
  let calls = 0
  collection.before.insert(function () { calls++ })

  Package['matb33:collection-hooks'] = {}
  try {
    await withDebugCapture(async () => {
      await collection.insertAsync({ value: 1 })
    })
  } finally {
    delete Package['matb33:collection-hooks']
  }

  test.equal(calls, 0)
  await collection.insertAsync({ value: 2 })
  test.equal(calls, 1)
})

if (Meteor.isServer) {
  Tinytest.addAsync('core - CollectionHooks.defaultUserId is used outside of a DDP context', async function (test) {
    const collection = new Mongo.Collection(null)
    let hookUserId

    collection.before.insert(function (userId) {
      hookUserId = userId
    })

    CollectionHooks.defaultUserId = 'default-user'
    try {
      await collection.insertAsync({ value: 1 })
    } finally {
      CollectionHooks.defaultUserId = undefined
    }

    test.equal(hookUserId, 'default-user')
  })
}

if (Meteor.isClient) {
  Tinytest.addAsync('core - hooks run without accounts-base on the client', async function (test) {
    const collection = new Mongo.Collection(null)
    let hookUserId = 'unset'

    collection.before.insert(function (userId) {
      hookUserId = userId
    })

    const originalUserId = Meteor.userId
    Meteor.userId = undefined
    try {
      await collection.insertAsync({ value: 1 })
    } finally {
      Meteor.userId = originalUserId
    }

    test.equal(hookUserId, undefined)
  })
}

// Writes sent by clients through the insecure mutation methods run the server
// hooks for both the async and the sync client APIs.
const insecureCollection = new Mongo.Collection('test_core_hooks_insecure')

if (Meteor.isServer) {
  insecureCollection._insecure = true

  insecureCollection.before.insert(function (userId, doc) {
    doc.server_value = true
  })

  Meteor.methods({
    async test_core_hooks_insecure_get (id) {
      return insecureCollection.findOneAsync(id)
    }
  })
}

if (Meteor.isClient) {
  Tinytest.addAsync('core - client sync insert runs server hooks through the insecure method', async function (test) {
    const id = await new Promise((resolve, reject) => {
      insecureCollection.insert({ start_value: true }, (error, result) => {
        if (error) reject(error)
        else resolve(result)
      })
    })

    const doc = await Meteor.callAsync('test_core_hooks_insecure_get', id)
    test.equal(doc && doc.server_value, true)
  })

  Tinytest.addAsync('core - client insertAsync runs server hooks through the insecure method', async function (test) {
    const id = await insecureCollection.insertAsync({ start_value: true })

    const doc = await Meteor.callAsync('test_core_hooks_insecure_get', id)
    test.equal(doc && doc.server_value, true)
  })
}
