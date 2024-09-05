/* eslint-env mocha */
/* global Roles */

import { Meteor } from 'meteor/meteor'
import { assert } from 'chai'

// To ensure that the files are loaded for coverage
import '../roles_client'

const safeInsert = (collection, data) => {
  try {
    collection.insert(data)
  } catch (e) {}
}

describe('roles', function () {
  const roles = ['admin', 'editor', 'user']
  const users = {
    eve: {
      _id: 'eve'
    },
    bob: {
      _id: 'bob'
    },
    joe: {
      _id: 'joe'
    }
  }

  function testUser (username, expectedRoles, scope) {
    const user = users[username]

    // test using user object rather than userId to avoid mocking
    for (const role of roles) {
      const expected = expectedRoles.includes(role)
      const msg = username + ' expected to have \'' + role + '\' permission but does not'
      const nmsg = username + ' had un-expected permission ' + role

      if (expected) {
        assert.isTrue(Roles.userIsInRole(user, role, scope), msg)
      } else {
        assert.isFalse(Roles.userIsInRole(user, role, scope), nmsg)
      }
    }
  }

  let meteorUserMethod
  before(() => {
    meteorUserMethod = Meteor.user
    // Mock Meteor.user() for isInRole handlebars helper testing
    Meteor.user = function () {
      return users.eve
    }
  })

  after(() => {
    Meteor.user = meteorUserMethod
  })

  beforeEach(() => {
    safeInsert(Meteor.roleAssignment, {
      user: users.eve,
      role: { _id: 'admin' },
      inheritedRoles: [{ _id: 'admin' }]
    })
    safeInsert(Meteor.roleAssignment, {
      user: users.eve,
      role: { _id: 'editor' },
      inheritedRoles: [{ _id: 'editor' }]
    })

    safeInsert(Meteor.roleAssignment, {
      user: users.bob,
      role: { _id: 'user' },
      inheritedRoles: [{ _id: 'user' }],
      scope: 'group1'
    })
    safeInsert(Meteor.roleAssignment, {
      user: users.bob,
      role: { _id: 'editor' },
      inheritedRoles: [{ _id: 'editor' }],
      scope: 'group2'
    })

    safeInsert(Meteor.roleAssignment, {
      user: users.joe,
      role: { _id: 'admin' },
      inheritedRoles: [{ _id: 'admin' }]
    })
    safeInsert(Meteor.roleAssignment, {
      user: users.joe,
      role: { _id: 'editor' },
      inheritedRoles: [{ _id: 'editor' }],
      scope: 'group1'
    })
  })

  it('can check current users roles via template helper', function () {
    let expected
    let actual

    if (!Roles._handlebarsHelpers) {
      // probably running package tests outside of a Meteor app.
      // skip this test.
      return
    }

    const isInRole = Roles._handlebarsHelpers.isInRole
    assert.equal(typeof isInRole, 'function', "'isInRole' helper not registered")

    expected = true
    actual = isInRole('admin, editor')
    assert.equal(actual, expected)

    expected = true
    actual = isInRole('admin')
    assert.equal(actual, expected)

    expected = false
    actual = isInRole('unknown')
    assert.equal(actual, expected)
  })

  it('can check if user is in role', function () {
    testUser('eve', ['admin', 'editor'])
  })

  it('can check if user is in role by group', function () {
    testUser('bob', ['user'], 'group1')
    testUser('bob', ['editor'], 'group2')
  })

  it('can check if user is in role with Roles.GLOBAL_GROUP', function () {
    testUser('joe', ['admin'])
    testUser('joe', ['admin'], Roles.GLOBAL_GROUP)
    testUser('joe', ['admin', 'editor'], 'group1')
  })
})
