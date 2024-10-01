/* eslint-env mocha */
/* global Roles */

import { Meteor } from 'meteor/meteor'
import chai, { assert } from 'chai'
import chaiAsPromised from 'chai-as-promised'

// To ensure that the files are loaded for coverage
import 'packages/roles/roles_client'
import 'packages/roles/roles_common_async'

chai.use(chaiAsPromised)

const safeInsert = async (collection, data) => {
  return await collection.insertAsync(data).catch(e => console.error(e))
}

describe('roles async', function () {
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

  async function testUser (username, expectedRoles, scope) {
    const user = users[username]

    // test using user object rather than userId to avoid mocking
    for (const role of roles) {
      const expected = expectedRoles.includes(role)
      const msg = username + ' expected to have \'' + role + '\' permission but does not'
      const nmsg = username + ' had un-expected permission ' + role

      const result = await Roles.userIsInRoleAsync(user._id, role, scope)
      if (expected) {
        assert.isTrue(result, msg)
      } else {
        assert.isFalse(result, nmsg)
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
    Meteor.subscribe('client_assignments')
  })

  after(() => {
    Meteor.user = meteorUserMethod
  })

  beforeEach(async () => {
    await safeInsert(Meteor.roleAssignment, {
      user: users.eve,
      role: { _id: 'admin' },
      inheritedRoles: [{ _id: 'admin' }]
    })
    await safeInsert(Meteor.roleAssignment, {
      user: users.eve,
      role: { _id: 'editor' },
      inheritedRoles: [{ _id: 'editor' }]
    })

    await safeInsert(Meteor.roleAssignment, {
      user: users.bob,
      role: { _id: 'user' },
      inheritedRoles: [{ _id: 'user' }],
      scope: 'group1'
    })
    await safeInsert(Meteor.roleAssignment, {
      user: users.bob,
      role: { _id: 'editor' },
      inheritedRoles: [{ _id: 'editor' }],
      scope: 'group2'
    })

    await safeInsert(Meteor.roleAssignment, {
      user: users.joe,
      role: { _id: 'admin' },
      inheritedRoles: [{ _id: 'admin' }]
    })
    await safeInsert(Meteor.roleAssignment, {
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

  it('can check if user is in role', async function () {
    await testUser('eve', ['admin', 'editor'])
  })

  it('can check if user is in role by group', async function () {
    await testUser('bob', ['user'], 'group1')
    await testUser('bob', ['editor'], 'group2')
  })

  it('can check if user is in role with Roles.GLOBAL_GROUP', async function () {
    await testUser('joe', ['admin'])
    await testUser('joe', ['admin'], Roles.GLOBAL_GROUP)
    await testUser('joe', ['admin', 'editor'], 'group1')
  })
})
