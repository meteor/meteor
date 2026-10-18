import { Meteor } from 'meteor/meteor'
import { Tinytest } from 'meteor/tinytest'

if (Meteor.isServer && Meteor.users) {
  Tinytest.addAsync('find_users - should work on Meteor.users', async function (test) {
    const selector = { test: 1 }
    const aspect1 = Meteor.users.before.find(function (userId, nextSelector) {
      if (nextSelector && nextSelector.test) {
        nextSelector.a = 1
      }
    })
    const aspect2 = Meteor.users.after.find(function (userId, nextSelector) {
      if (nextSelector && nextSelector.test) {
        nextSelector.b = 1
      }
    })

    try {
      await Meteor.users.find(selector).fetchAsync()

      test.equal(Object.prototype.hasOwnProperty.call(selector, 'a'), true)
      test.equal(Object.prototype.hasOwnProperty.call(selector, 'b'), true)
    } finally {
      aspect1.remove()
      aspect2.remove()
    }
  })

  Tinytest.addAsync('find_users - should work on wrapped Meteor.users', async function (test) {
    function TestUser (doc) {
      return Object.assign(this, doc)
    }

    const selector = { test: 1 }
    const originalTransform = Meteor.users.__transform
    const originalFind = Meteor.users.find

    Meteor.users.__transform = doc => new TestUser(doc)
    Meteor.users.find = function (nextSelector = {}, options = {}) {
      return originalFind.call(this, nextSelector, {
        transform: Meteor.users.__transform,
        ...options
      })
    }

    const aspect1 = Meteor.users.before.find(function (userId, nextSelector) {
      if (nextSelector && nextSelector.test) {
        nextSelector.a = 1
      }
    })
    const aspect2 = Meteor.users.after.find(function (userId, nextSelector) {
      if (nextSelector && nextSelector.test) {
        nextSelector.b = 1
      }
    })

    try {
      await Meteor.users.find(selector).fetchAsync()

      test.equal(Object.prototype.hasOwnProperty.call(selector, 'a'), true)
      test.equal(Object.prototype.hasOwnProperty.call(selector, 'b'), true)
    } finally {
      aspect1.remove()
      aspect2.remove()
      Meteor.users.find = originalFind
      Meteor.users.__transform = originalTransform
    }
  })
}
