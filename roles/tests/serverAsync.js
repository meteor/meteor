/* eslint-env mocha */
/* global Roles */

import { Meteor } from 'meteor/meteor'
import chai, { assert } from 'chai'
import chaiAsPromised from 'chai-as-promised'

// To ensure that the files are loaded for coverage
import '../roles_server'
import '../roles_common'

chai.use(chaiAsPromised)

// To allow inserting on the client, needed for testing.
Meteor.roleAssignment.allow({
  insert () { return true },
  update () { return true },
  remove () { return true }
})

const hasProp = (target, prop) => Object.hasOwnProperty.call(target, prop)

describe('roles async', async function () {
  let users = {}
  const roles = ['admin', 'editor', 'user']

  Meteor.publish('_roleAssignments', function () {
    const loggedInUserId = this.userId

    if (!loggedInUserId) {
      this.ready()
      return
    }

    return Meteor.roleAssignment.find({ _id: loggedInUserId })
  })

  async function addUser (name) {
    return await Meteor.users.insertAsync({ username: name })
  }

  async function testUser (username, expectedRoles, scope) {
    const userId = users[username]
    const userObj = await Meteor.users.findOneAsync({ _id: userId })

    // check using user ids (makes db calls)
    await _innerTest(userId, username, expectedRoles, scope)

    // check using passed-in user object
    await _innerTest(userObj, username, expectedRoles, scope)
  }

  async function _innerTest (userParam, username, expectedRoles, scope) {
    // test that user has only the roles expected and no others
    for (const role of roles) {
      const expected = expectedRoles.includes(role)
      const msg = username + ' expected to have \'' + role + '\' role but does not'
      const nmsg = username + ' had the following un-expected role: ' + role

      if (expected) {
        assert.isTrue(await Roles.userIsInRoleAsync(userParam, role, scope), msg)
      } else {
        assert.isFalse(await Roles.userIsInRoleAsync(userParam, role, scope), nmsg)
      }
    }
  }

  beforeEach(async function () {
    await Meteor.roles.removeAsync({})
    await Meteor.roleAssignment.removeAsync({})
    await Meteor.users.removeAsync({})

    users = {
      eve: await addUser('eve'),
      bob: await addUser('bob'),
      joe: await addUser('joe')
    }
  })

  it('can create and delete roles', async function () {
    const role1Id = await Roles.createRoleAsync('test1')
    const test1a = await Meteor.roles.findOneAsync()
    const test1b = await Meteor.roles.findOneAsync(role1Id)
    assert.equal(test1a._id, 'test1')
    assert.equal(test1b._id, 'test1')

    const role2Id = await Roles.createRoleAsync('test2')
    const test2a = await Meteor.roles.findOneAsync({ _id: 'test2' })
    const test2b = await Meteor.roles.findOneAsync(role2Id)
    assert.equal(test2a._id, 'test2')
    assert.equal(test2b._id, 'test2')

    assert.equal(await Meteor.roles.countDocuments(), 2)

    await Roles.deleteRoleAsync('test1')
    const undefinedTest = await Meteor.roles.findOneAsync({ _id: 'test1' })
    assert.equal(typeof undefinedTest, 'undefined')

    await Roles.deleteRoleAsync('test2')
    const undefinedTest2 = await Meteor.roles.findOneAsync()
    assert.equal(typeof undefinedTest2, 'undefined')
  })

  it('can try to remove non-existing roles without crashing', async function () {
    try {
      await Roles.deleteRoleAsync('non-existing-role')
    } catch (e) {
      assert.notExists(e)
    }
    // Roles.deleteRoleAsync('non-existing-role').should.be.fulfilled
  })

  it('can\'t create duplicate roles', async function () {
    try {
      await Roles.createRoleAsync('test1')
    } catch (e) {
      assert.notExists(e)
    }
    // assert.eventually.throws(Roles.createRoleAsync('test1'))
    try {
      await Roles.createRoleAsync('test1')
    } catch (e) {
      assert.exists(e)
    }
    assert.isNull(await Roles.createRoleAsync('test1', { unlessExists: true }))
  })

  it('can\'t create role with empty names', async function () {
    assert.isRejected(Roles.createRoleAsync(''), /Invalid role name/)
    assert.isRejected(Roles.createRoleAsync(null), /Invalid role name/)
    assert.isRejected(Roles.createRoleAsync(' '), /Invalid role name/)
    assert.isRejected(Roles.createRoleAsync(' foobar'), /Invalid role name/)
    assert.isRejected(Roles.createRoleAsync(' foobar '), /Invalid role name/)
  })

  it('can\'t use invalid scope names', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')
    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync(users.eve, ['editor'], 'scope2')

    assert.isRejected(Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], ''), /Invalid scope name/)
    assert.isRejected(Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], ' '), /Invalid scope name/)
    assert.isRejected(Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], ' foobar'), /Invalid scope name/)
    assert.isRejected(Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], ' foobar '), /Invalid scope name/)
    assert.isRejected(Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], 42), /Invalid scope name/)
  })

  it('can check if user is in role', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'])

    await testUser('eve', ['admin', 'user'])
  })

  it('can check if user is in role by scope', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')
    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync(users.eve, ['editor'], 'scope2')

    testUser('eve', ['admin', 'user'], 'scope1')
    testUser('eve', ['editor'], 'scope2')

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['admin', 'user'], 'scope2'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['editor'], 'scope1'))

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, ['admin', 'user'], { anyScope: true }))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, ['editor'], { anyScope: true }))
  })

  it('can check if user is in role by scope through options', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')
    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], { scope: 'scope1' })
    await Roles.addUsersToRolesAsync(users.eve, ['editor'], { scope: 'scope2' })

    await testUser('eve', ['admin', 'user'], { scope: 'scope1' })
    await testUser('eve', ['editor'], { scope: 'scope2' })
  })

  // it('can check if user is in role by scope with global role', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //   Roles.createRoleAsync('editor')
  //   Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], 'scope1')
  //   Roles.addUsersToRolesAsync(users.eve, ['editor'], 'scope2')
  //   Roles.addUsersToRolesAsync(users.eve, ['admin'])
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, ['user'], 'scope1'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, ['editor'], 'scope2'))
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, ['user']))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, ['editor']))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, ['user'], null))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, ['editor'], null))
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, ['user'], 'scope2'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, ['editor'], 'scope1'))
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, ['admin'], 'scope2'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, ['admin'], 'scope1'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, ['admin']))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, ['admin'], null))
  // })

  it('renaming scopes', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')
    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync(users.eve, ['editor'], 'scope2')

    await testUser('eve', ['admin', 'user'], 'scope1')
    await testUser('eve', ['editor'], 'scope2')

    await Roles.renameScopeAsync('scope1', 'scope3')

    await testUser('eve', ['admin', 'user'], 'scope3')
    await testUser('eve', ['editor'], 'scope2')

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['admin', 'user'], 'scope1'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['admin', 'user'], 'scope2'))

    assert.isRejected(Roles.renameScopeAsync('scope3'), /Invalid scope name/)

    await Roles.renameScopeAsync('scope3', null)

    await testUser('eve', ['admin', 'user', 'editor'], 'scope2')

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['editor']))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, ['admin']))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, ['user']))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['editor'], null))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, ['admin'], null))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, ['user'], null))

    await Roles.renameScopeAsync(null, 'scope2')

    await testUser('eve', ['admin', 'user', 'editor'], 'scope2')

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['editor']))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['admin']))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['user']))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['editor'], null))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['admin'], null))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['user'], null))
  })

  it('removing scopes', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')
    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync(users.eve, ['editor'], 'scope2')

    await testUser('eve', ['admin', 'user'], 'scope1')
    await testUser('eve', ['editor'], 'scope2')

    await Roles.removeScopeAsync('scope1')

    await testUser('eve', ['editor'], 'scope2')

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['admin', 'user'], 'scope1'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['admin', 'user'], 'scope2'))
  })

  it('can check if non-existant user is in role', async function () {
    assert.isFalse(await Roles.userIsInRoleAsync('1', 'admin'))
  })

  it('can check if null user is in role', async function () {
    assert.isFalse(await Roles.userIsInRoleAsync(null, 'admin'))
  })

  it('can check user against several roles at once', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')

    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'])
    const user = await Meteor.users.findOneAsync({ _id: users.eve })

    // we can check the non-existing role
    assert.isTrue(await Roles.userIsInRoleAsync(user, ['editor', 'admin']))
  })

  it('can\'t add non-existent user to role', async function () {
    await Roles.createRoleAsync('admin')

    await Roles.addUsersToRolesAsync(['1'], ['admin'])
    assert.equal(await Meteor.users.findOneAsync({ _id: '1' }), undefined)
  })

  it('can\'t add user to non-existent role', async function () {
    assert.isRejected(Roles.addUsersToRolesAsync(users.eve, ['admin']), /Role 'admin' does not exist/)
    await Roles.addUsersToRolesAsync(users.eve, ['admin'], { ifExists: true })
  })

  it('can\'t set non-existent user to role', async function () {
    await Roles.createRoleAsync('admin')

    await Roles.setUserRolesAsync(['1'], ['admin'])
    assert.equal(await Meteor.users.findOneAsync({ _id: '1' }), undefined)
  })

  it('can\'t set user to non-existent role', async function () {
    assert.isRejected(Roles.setUserRolesAsync(users.eve, ['admin']), /Role 'admin' does not exist/)
    await Roles.setUserRolesAsync(users.eve, ['admin'], { ifExists: true })
  })

  it('can add individual users to roles', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'])

    await testUser('eve', ['admin', 'user'])
    await testUser('bob', [])
    await testUser('joe', [])

    await Roles.addUsersToRolesAsync(users.joe, ['editor', 'user'])

    await testUser('eve', ['admin', 'user'])
    await testUser('bob', [])
    await testUser('joe', ['editor', 'user'])
  })

  it('can add individual users to roles by scope', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], 'scope1')

    await testUser('eve', ['admin', 'user'], 'scope1')
    await testUser('bob', [], 'scope1')
    await testUser('joe', [], 'scope1')

    await testUser('eve', [], 'scope2')
    await testUser('bob', [], 'scope2')
    await testUser('joe', [], 'scope2')

    await Roles.addUsersToRolesAsync(users.joe, ['editor', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync(users.bob, ['editor', 'user'], 'scope2')

    await testUser('eve', ['admin', 'user'], 'scope1')
    await testUser('bob', [], 'scope1')
    await testUser('joe', ['editor', 'user'], 'scope1')

    await testUser('eve', [], 'scope2')
    await testUser('bob', ['editor', 'user'], 'scope2')
    await testUser('joe', [], 'scope2')
  })

  it('can add user to roles via user object', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    const eve = await Meteor.users.findOneAsync({ _id: users.eve })
    const bob = await Meteor.users.findOneAsync({ _id: users.bob })

    await Roles.addUsersToRolesAsync(eve, ['admin', 'user'])

    await testUser('eve', ['admin', 'user'])
    await testUser('bob', [])
    await testUser('joe', [])

    await Roles.addUsersToRolesAsync(bob, ['editor'])

    await testUser('eve', ['admin', 'user'])
    await testUser('bob', ['editor'])
    await testUser('joe', [])
  })

  it('can add user to roles multiple times', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'])
    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'])

    await testUser('eve', ['admin', 'user'])
    await testUser('bob', [])
    await testUser('joe', [])

    await Roles.addUsersToRolesAsync(users.bob, ['admin'])
    await Roles.addUsersToRolesAsync(users.bob, ['editor'])

    await testUser('eve', ['admin', 'user'])
    await testUser('bob', ['admin', 'editor'])
    await testUser('joe', [])
  })

  it('can add user to roles multiple times by scope', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], 'scope1')

    await testUser('eve', ['admin', 'user'], 'scope1')
    await testUser('bob', [], 'scope1')
    await testUser('joe', [], 'scope1')

    await Roles.addUsersToRolesAsync(users.bob, ['admin'], 'scope1')
    await Roles.addUsersToRolesAsync(users.bob, ['editor'], 'scope1')

    await testUser('eve', ['admin', 'user'], 'scope1')
    await testUser('bob', ['admin', 'editor'], 'scope1')
    await testUser('joe', [], 'scope1')
  })

  it('can add multiple users to roles', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    await Roles.addUsersToRolesAsync([users.eve, users.bob], ['admin', 'user'])

    await testUser('eve', ['admin', 'user'])
    await testUser('bob', ['admin', 'user'])
    await testUser('joe', [])

    await Roles.addUsersToRolesAsync([users.bob, users.joe], ['editor', 'user'])

    await testUser('eve', ['admin', 'user'])
    await testUser('bob', ['admin', 'editor', 'user'])
    await testUser('joe', ['editor', 'user'])
  })

  it('can add multiple users to roles by scope', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    await Roles.addUsersToRolesAsync([users.eve, users.bob], ['admin', 'user'], 'scope1')

    await testUser('eve', ['admin', 'user'], 'scope1')
    await testUser('bob', ['admin', 'user'], 'scope1')
    await testUser('joe', [], 'scope1')

    await testUser('eve', [], 'scope2')
    await testUser('bob', [], 'scope2')
    await testUser('joe', [], 'scope2')

    await Roles.addUsersToRolesAsync([users.bob, users.joe], ['editor', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync([users.bob, users.joe], ['editor', 'user'], 'scope2')

    await testUser('eve', ['admin', 'user'], 'scope1')
    await testUser('bob', ['admin', 'editor', 'user'], 'scope1')
    await testUser('joe', ['editor', 'user'], 'scope1')

    await testUser('eve', [], 'scope2')
    await testUser('bob', ['editor', 'user'], 'scope2')
    await testUser('joe', ['editor', 'user'], 'scope2')
  })

  it('can remove individual users from roles', async function () {
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    // remove user role - one user
    await Roles.addUsersToRolesAsync([users.eve, users.bob], ['editor', 'user'])
    await testUser('eve', ['editor', 'user'])
    await testUser('bob', ['editor', 'user'])
    await Roles.removeUsersFromRolesAsync(users.eve, ['user'])
    await testUser('eve', ['editor'])
    await testUser('bob', ['editor', 'user'])
  })

  it('can remove user from roles multiple times', async function () {
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    // remove user role - one user
    await Roles.addUsersToRolesAsync([users.eve, users.bob], ['editor', 'user'])
    await testUser('eve', ['editor', 'user'])
    await testUser('bob', ['editor', 'user'])
    await Roles.removeUsersFromRolesAsync(users.eve, ['user'])
    await testUser('eve', ['editor'])
    await testUser('bob', ['editor', 'user'])

    // try remove again
    await Roles.removeUsersFromRolesAsync(users.eve, ['user'])
    await testUser('eve', ['editor'])
  })

  it('can remove users from roles via user object', async function () {
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    const eve = await Meteor.users.findOneAsync({ _id: users.eve })
    const bob = await Meteor.users.findOneAsync({ _id: users.bob })

    // remove user role - one user
    await Roles.addUsersToRolesAsync([eve, bob], ['editor', 'user'])
    await testUser('eve', ['editor', 'user'])
    await testUser('bob', ['editor', 'user'])
    await Roles.removeUsersFromRolesAsync(eve, ['user'])
    await testUser('eve', ['editor'])
    await testUser('bob', ['editor', 'user'])
  })

  it('can remove individual users from roles by scope', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    // remove user role - one user
    await Roles.addUsersToRolesAsync([users.eve, users.bob], ['editor', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync([users.joe, users.bob], ['admin'], 'scope2')
    await testUser('eve', ['editor', 'user'], 'scope1')
    await testUser('bob', ['editor', 'user'], 'scope1')
    await testUser('joe', [], 'scope1')
    await testUser('eve', [], 'scope2')
    await testUser('bob', ['admin'], 'scope2')
    await testUser('joe', ['admin'], 'scope2')

    await Roles.removeUsersFromRolesAsync(users.eve, ['user'], 'scope1')
    await testUser('eve', ['editor'], 'scope1')
    await testUser('bob', ['editor', 'user'], 'scope1')
    await testUser('joe', [], 'scope1')
    await testUser('eve', [], 'scope2')
    await testUser('bob', ['admin'], 'scope2')
    await testUser('joe', ['admin'], 'scope2')
  })

  it('can remove individual users from roles by scope through options', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    // remove user role - one user
    await Roles.addUsersToRolesAsync([users.eve, users.bob], ['editor', 'user'], { scope: 'scope1' })
    await Roles.addUsersToRolesAsync([users.joe, users.bob], ['admin'], { scope: 'scope2' })
    await testUser('eve', ['editor', 'user'], 'scope1')
    await testUser('bob', ['editor', 'user'], 'scope1')
    await testUser('joe', [], 'scope1')
    await testUser('eve', [], 'scope2')
    await testUser('bob', ['admin'], 'scope2')
    await testUser('joe', ['admin'], 'scope2')

    await Roles.removeUsersFromRolesAsync(users.eve, ['user'], { scope: 'scope1' })
    await testUser('eve', ['editor'], 'scope1')
    await testUser('bob', ['editor', 'user'], 'scope1')
    await testUser('joe', [], 'scope1')
    await testUser('eve', [], 'scope2')
    await testUser('bob', ['admin'], 'scope2')
    await testUser('joe', ['admin'], 'scope2')
  })

  it('can remove multiple users from roles', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    // remove user role - two users
    await Roles.addUsersToRolesAsync([users.eve, users.bob], ['editor', 'user'])
    await testUser('eve', ['editor', 'user'])
    await testUser('bob', ['editor', 'user'])

    assert.isFalse(await Roles.userIsInRoleAsync(users.joe, 'admin'))
    await Roles.addUsersToRolesAsync([users.bob, users.joe], ['admin', 'user'])
    await testUser('bob', ['admin', 'user', 'editor'])
    await testUser('joe', ['admin', 'user'])
    await Roles.removeUsersFromRolesAsync([users.bob, users.joe], ['admin'])
    await testUser('bob', ['user', 'editor'])
    await testUser('joe', ['user'])
  })

  it('can remove multiple users from roles by scope', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    // remove user role - one user
    await Roles.addUsersToRolesAsync([users.eve, users.bob], ['editor', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync([users.joe, users.bob], ['admin'], 'scope2')
    await testUser('eve', ['editor', 'user'], 'scope1')
    await testUser('bob', ['editor', 'user'], 'scope1')
    await testUser('joe', [], 'scope1')
    await testUser('eve', [], 'scope2')
    await testUser('bob', ['admin'], 'scope2')
    await testUser('joe', ['admin'], 'scope2')

    await Roles.removeUsersFromRolesAsync([users.eve, users.bob], ['user'], 'scope1')
    await testUser('eve', ['editor'], 'scope1')
    await testUser('bob', ['editor'], 'scope1')
    await testUser('joe', [], 'scope1')
    await testUser('eve', [], 'scope2')
    await testUser('bob', ['admin'], 'scope2')
    await testUser('joe', ['admin'], 'scope2')

    await Roles.removeUsersFromRolesAsync([users.joe, users.bob], ['admin'], 'scope2')
    await testUser('eve', [], 'scope2')
    await testUser('bob', [], 'scope2')
    await testUser('joe', [], 'scope2')
  })

  it('can remove multiple users from roles of any scope', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    // remove user role - one user
    await Roles.addUsersToRolesAsync([users.eve, users.bob], ['editor', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync([users.joe, users.bob], ['user'], 'scope2')
    await testUser('eve', ['editor', 'user'], 'scope1')
    await testUser('bob', ['editor', 'user'], 'scope1')
    await testUser('joe', [], 'scope1')
    await testUser('eve', [], 'scope2')
    await testUser('bob', ['user'], 'scope2')
    await testUser('joe', ['user'], 'scope2')

    await Roles.removeUsersFromRolesAsync([users.eve, users.bob], ['user'], { anyScope: true })
    await testUser('eve', ['editor'], 'scope1')
    await testUser('bob', ['editor'], 'scope1')
    await testUser('joe', [], 'scope1')
    await testUser('eve', [], 'scope2')
    await testUser('bob', [], 'scope2')
    await testUser('joe', ['user'], 'scope2')
  })

  it('can set user roles', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    const eve = await Meteor.users.findOneAsync({ _id: users.eve })
    const bob = await Meteor.users.findOneAsync({ _id: users.bob })

    await Roles.setUserRolesAsync([users.eve, bob], ['editor', 'user'])
    await testUser('eve', ['editor', 'user'])
    await testUser('bob', ['editor', 'user'])
    await testUser('joe', [])

    // use addUsersToRoles add some roles
    await Roles.addUsersToRolesAsync([bob, users.joe], ['admin'])
    await testUser('eve', ['editor', 'user'])
    await testUser('bob', ['admin', 'editor', 'user'])
    await testUser('joe', ['admin'])

    await Roles.setUserRolesAsync([eve, bob], ['user'])
    await testUser('eve', ['user'])
    await testUser('bob', ['user'])
    await testUser('joe', ['admin'])

    await Roles.setUserRolesAsync(bob, 'editor')
    await testUser('eve', ['user'])
    await testUser('bob', ['editor'])
    await testUser('joe', ['admin'])

    await Roles.setUserRolesAsync([users.joe, users.bob], [])
    await testUser('eve', ['user'])
    await testUser('bob', [])
    await testUser('joe', [])
  })

  it('can set user roles by scope', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    const eve = await Meteor.users.findOneAsync({ _id: users.eve })
    const bob = await Meteor.users.findOneAsync({ _id: users.bob })
    const joe = await Meteor.users.findOneAsync({ _id: users.joe })

    await Roles.setUserRolesAsync([users.eve, users.bob], ['editor', 'user'], 'scope1')
    await Roles.setUserRolesAsync([users.bob, users.joe], ['admin'], 'scope2')
    await testUser('eve', ['editor', 'user'], 'scope1')
    await testUser('bob', ['editor', 'user'], 'scope1')
    await testUser('joe', [], 'scope1')
    await testUser('eve', [], 'scope2')
    await testUser('bob', ['admin'], 'scope2')
    await testUser('joe', ['admin'], 'scope2')

    // use addUsersToRoles add some roles
    await Roles.addUsersToRolesAsync([users.eve, users.bob], ['admin'], 'scope1')
    await Roles.addUsersToRolesAsync([users.bob, users.joe], ['editor'], 'scope2')
    await testUser('eve', ['admin', 'editor', 'user'], 'scope1')
    await testUser('bob', ['admin', 'editor', 'user'], 'scope1')
    await testUser('joe', [], 'scope1')
    await testUser('eve', [], 'scope2')
    await testUser('bob', ['admin', 'editor'], 'scope2')
    await testUser('joe', ['admin', 'editor'], 'scope2')

    await Roles.setUserRolesAsync([eve, bob], ['user'], 'scope1')
    await Roles.setUserRolesAsync([eve, joe], ['editor'], 'scope2')
    await testUser('eve', ['user'], 'scope1')
    await testUser('bob', ['user'], 'scope1')
    await testUser('joe', [], 'scope1')
    await testUser('eve', ['editor'], 'scope2')
    await testUser('bob', ['admin', 'editor'], 'scope2')
    await testUser('joe', ['editor'], 'scope2')

    await Roles.setUserRolesAsync(bob, 'editor', 'scope1')
    await testUser('eve', ['user'], 'scope1')
    await testUser('bob', ['editor'], 'scope1')
    await testUser('joe', [], 'scope1')
    await testUser('eve', ['editor'], 'scope2')
    await testUser('bob', ['admin', 'editor'], 'scope2')
    await testUser('joe', ['editor'], 'scope2')

    const bobRoles1 = await Roles.getRolesForUserAsync(users.bob, { anyScope: true, fullObjects: true })
    const joeRoles1 = await Roles.getRolesForUserAsync(users.joe, { anyScope: true, fullObjects: true })
    assert.isTrue(bobRoles1.map(r => r.scope).includes('scope1'))
    assert.isFalse(joeRoles1.map(r => r.scope).includes('scope1'))

    await Roles.setUserRolesAsync([bob, users.joe], [], 'scope1')
    await testUser('eve', ['user'], 'scope1')
    await testUser('bob', [], 'scope1')
    await testUser('joe', [], 'scope1')
    await testUser('eve', ['editor'], 'scope2')
    await testUser('bob', ['admin', 'editor'], 'scope2')
    await testUser('joe', ['editor'], 'scope2')

    // When roles in a given scope are removed, we do not want any dangling database content for that scope.
    const bobRoles2 = await Roles.getRolesForUserAsync(users.bob, { anyScope: true, fullObjects: true })
    const joeRoles2 = await Roles.getRolesForUserAsync(users.joe, { anyScope: true, fullObjects: true })
    assert.isFalse(bobRoles2.map(r => r.scope).includes('scope1'))
    assert.isFalse(joeRoles2.map(r => r.scope).includes('scope1'))
  })

  it('can set user roles by scope including GLOBAL_SCOPE', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('editor')

    const eve = await Meteor.users.findOneAsync({ _id: users.eve })

    await Roles.addUsersToRolesAsync(eve, 'admin', Roles.GLOBAL_SCOPE)
    await testUser('eve', ['admin'], 'scope1')
    await testUser('eve', ['admin'])

    await Roles.setUserRolesAsync(eve, 'editor', Roles.GLOBAL_SCOPE)
    await testUser('eve', ['editor'], 'scope2')
    await testUser('eve', ['editor'])
  })

  it('can set user roles by scope and anyScope', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('editor')

    const eve = await Meteor.users.findOneAsync({ _id: users.eve })

    const eveRoles = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(eveRoles.map(obj => { delete obj._id; return obj }), [])

    await Roles.addUsersToRolesAsync(eve, 'admin')

    const eveRoles2 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(eveRoles2.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'admin' }]
    }])

    await Roles.setUserRolesAsync(eve, 'editor', { anyScope: true, scope: 'scope2' })

    const eveRoles3 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(eveRoles3.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'editor' },
      scope: 'scope2',
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'editor' }]
    }])
  })

  it('can get all roles', async function () {
    for (const role of roles) {
      await Roles.createRoleAsync(role)
    }

    // compare roles, sorted alphabetically
    const expected = roles
    const actual = Roles.getAllRoles().fetch().map(r => r._id)

    assert.sameMembers(actual, expected)

    assert.sameMembers(Roles.getAllRoles({ sort: { _id: -1 } }).fetch().map(r => r._id), expected.reverse())
  })

  it('get an empty list of roles for an empty user', async function () {
    assert.sameMembers(await Roles.getRolesForUserAsync(undefined), [])
    assert.sameMembers(await Roles.getRolesForUserAsync(null), [])
    assert.sameMembers(await Roles.getRolesForUserAsync({}), [])
  })

  it('get an empty list of roles for non-existant user', async function () {
    assert.sameMembers(await Roles.getRolesForUserAsync('1'), [])
    assert.sameMembers(await Roles.getRolesForUserAsync('1', 'scope1'), [])
  })

  // it('can get all roles for user', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //
  //   const userId = users.eve
  //   let userObj
  //
  //   // by userId
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId), [])
  //
  //   // by user object
  //   userObj = Meteor.users.findOneAsync({ _id: userId })
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userObj), [])
  //
  //   Roles.addUsersToRolesAsync(userId, ['admin', 'user'])
  //
  //   // by userId
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId), ['admin', 'user'])
  //
  //   // by user object
  //   userObj = Meteor.users.findOneAsync({ _id: userId })
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userObj), ['admin', 'user'])
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(userId, { fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'admin' },
  //     scope: null,
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }, {
  //     role: { _id: 'user' },
  //     scope: null,
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'user' }]
  //   }])
  // })
  //
  // it('can get all roles for user by scope', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //
  //   const userId = users.eve
  //   let userObj
  //
  //   // by userId
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId, 'scope1'), [])
  //
  //   // by user object
  //   userObj = Meteor.users.findOneAsync({ _id: userId })
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userObj, 'scope1'), [])
  //
  //   // add roles
  //   Roles.addUsersToRolesAsync(userId, ['admin', 'user'], 'scope1')
  //   Roles.addUsersToRolesAsync(userId, ['admin'], 'scope2')
  //
  //   // by userId
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId, 'scope1'), ['admin', 'user'])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId, 'scope2'), ['admin'])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId), [])
  //
  //   // by user object
  //   userObj = Meteor.users.findOneAsync({ _id: userId })
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userObj, 'scope1'), ['admin', 'user'])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userObj, 'scope2'), ['admin'])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userObj), [])
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(userId, { fullObjects: true, scope: 'scope1' }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'admin' },
  //     scope: 'scope1',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }, {
  //     role: { _id: 'user' },
  //     scope: 'scope1',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'user' }]
  //   }])
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(userId, { fullObjects: true, scope: 'scope2' }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'admin' },
  //     scope: 'scope2',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }])
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(userId, { fullObjects: true, anyScope: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'admin' },
  //     scope: 'scope1',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }, {
  //     role: { _id: 'user' },
  //     scope: 'scope1',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'user' }]
  //   }, {
  //     role: { _id: 'admin' },
  //     scope: 'scope2',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }])
  //
  //   Roles.createRoleAsync('PERMISSION')
  //   Roles.addRolesToParent('PERMISSION', 'user')
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(userId, { fullObjects: true, scope: 'scope1' }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'admin' },
  //     scope: 'scope1',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }, {
  //     role: { _id: 'user' },
  //     scope: 'scope1',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'user' }, { _id: 'PERMISSION' }]
  //   }])
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(userId, { fullObjects: true, scope: 'scope2' }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'admin' },
  //     scope: 'scope2',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId, { scope: 'scope1' }), ['admin', 'user', 'PERMISSION'])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId, { scope: 'scope2' }), ['admin'])
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(userId, { fullObjects: true, anyScope: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'admin' },
  //     scope: 'scope1',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }, {
  //     role: { _id: 'user' },
  //     scope: 'scope1',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'user' }, { _id: 'PERMISSION' }]
  //   }, {
  //     role: { _id: 'admin' },
  //     scope: 'scope2',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId, { anyScope: true }), ['admin', 'user', 'PERMISSION'])
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(userId, { fullObjects: true, scope: 'scope1', onlyAssigned: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'admin' },
  //     scope: 'scope1',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }, {
  //     role: { _id: 'user' },
  //     scope: 'scope1',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'user' }, { _id: 'PERMISSION' }]
  //   }])
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(userId, { fullObjects: true, scope: 'scope2', onlyAssigned: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'admin' },
  //     scope: 'scope2',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId, { scope: 'scope1', onlyAssigned: true }), ['admin', 'user'])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId, { scope: 'scope2', onlyAssigned: true }), ['admin'])
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(userId, { fullObjects: true, anyScope: true, onlyAssigned: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'admin' },
  //     scope: 'scope1',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }, {
  //     role: { _id: 'user' },
  //     scope: 'scope1',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'user' }, { _id: 'PERMISSION' }]
  //   }, {
  //     role: { _id: 'admin' },
  //     scope: 'scope2',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId, { anyScope: true, onlyAssigned: true }), ['admin', 'user'])
  // })
  //
  // it('can get only scoped roles for user', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //
  //   const userId = users.eve
  //
  //   // add roles
  //   Roles.addUsersToRolesAsync(userId, ['user'], 'scope1')
  //   Roles.addUsersToRolesAsync(userId, ['admin'])
  //
  //   Roles.createRoleAsync('PERMISSION')
  //   Roles.addRolesToParent('PERMISSION', 'user')
  //
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId, { onlyScoped: true, scope: 'scope1' }), ['user', 'PERMISSION'])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId, { onlyScoped: true, onlyAssigned: true, scope: 'scope1' }), ['user'])
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(userId, { onlyScoped: true, fullObjects: true, scope: 'scope1' }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'user' },
  //     scope: 'scope1',
  //     user: { _id: userId },
  //     inheritedRoles: [{ _id: 'user' }, { _id: 'PERMISSION' }]
  //   }])
  // })
  //
  // it('can get all roles for user by scope with periods in name', function () {
  //   Roles.createRoleAsync('admin')
  //
  //   Roles.addUsersToRolesAsync(users.joe, ['admin'], 'example.k12.va.us')
  //
  //   assert.sameMembers(await Roles.getRolesForUserAsync(users.joe, 'example.k12.va.us'), ['admin'])
  // })
  //
  // it('can get all roles for user by scope including Roles.GLOBAL_SCOPE', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //   Roles.createRoleAsync('editor')
  //
  //   const userId = users.eve
  //
  //   Roles.addUsersToRolesAsync([users.eve], ['editor'], Roles.GLOBAL_SCOPE)
  //   Roles.addUsersToRolesAsync([users.eve], ['admin', 'user'], 'scope1')
  //
  //   // by userId
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId, 'scope1'), ['editor', 'admin', 'user'])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId), ['editor'])
  //
  //   // by user object
  //   const userObj = Meteor.users.findOneAsync({ _id: userId })
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userObj, 'scope1'), ['editor', 'admin', 'user'])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userObj), ['editor'])
  // })
  //
  // it('getRolesForUser should not return null entries if user has no roles for scope', function () {
  //   Roles.createRoleAsync('editor')
  //
  //   const userId = users.eve
  //   let userObj
  //
  //   // by userId
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId, 'scope1'), [])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId), [])
  //
  //   // by user object
  //   userObj = Meteor.users.findOneAsync({ _id: userId })
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userObj, 'scope1'), [])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userObj), [])
  //
  //   Roles.addUsersToRolesAsync([users.eve], ['editor'], Roles.GLOBAL_SCOPE)
  //
  //   // by userId
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId, 'scope1'), ['editor'])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userId), ['editor'])
  //
  //   // by user object
  //   userObj = Meteor.users.findOneAsync({ _id: userId })
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userObj, 'scope1'), ['editor'])
  //   assert.sameMembers(await Roles.getRolesForUserAsync(userObj), ['editor'])
  // })
  //
  // it('getRolesForUser should not fail during a call of addUsersToRoles', function () {
  //   Roles.createRoleAsync('editor')
  //
  //   const userId = users.eve
  //   const promises = []
  //   const interval = setInterval(() => {
  //     promises.push(Promise.resolve().then(() => { await Roles.getRolesForUserAsync(userId) }))
  //   }, 0)
  //
  //   Roles.addUsersToRolesAsync([users.eve], ['editor'], Roles.GLOBAL_SCOPE)
  //   clearInterval(interval)
  //
  //   return Promise.all(promises)
  // })
  //
  // it('returns an empty list of scopes for null as user-id', function () {
  //   assert.sameMembers(Roles.getScopesForUser(undefined), [])
  //   assert.sameMembers(Roles.getScopesForUser(null), [])
  //   assert.sameMembers(Roles.getScopesForUser('foo'), [])
  //   assert.sameMembers(Roles.getScopesForUser({}), [])
  //   assert.sameMembers(Roles.getScopesForUser({ _id: 'foo' }), [])
  // })
  //
  // it('can get all scopes for user', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //   Roles.createRoleAsync('editor')
  //
  //   const userId = users.eve
  //
  //   Roles.addUsersToRolesAsync([users.eve], ['editor'], 'scope1')
  //   Roles.addUsersToRolesAsync([users.eve], ['admin', 'user'], 'scope2')
  //
  //   // by userId
  //   assert.sameMembers(Roles.getScopesForUser(userId), ['scope1', 'scope2'])
  //
  //   // by user object
  //   const userObj = Meteor.users.findOneAsync({ _id: userId })
  //   assert.sameMembers(Roles.getScopesForUser(userObj), ['scope1', 'scope2'])
  // })
  //
  // it('can get all scopes for user by role', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //   Roles.createRoleAsync('editor')
  //
  //   const userId = users.eve
  //
  //   Roles.addUsersToRolesAsync([users.eve], ['editor'], 'scope1')
  //   Roles.addUsersToRolesAsync([users.eve], ['editor', 'user'], 'scope2')
  //
  //   // by userId
  //   assert.sameMembers(Roles.getScopesForUser(userId, 'user'), ['scope2'])
  //   assert.sameMembers(Roles.getScopesForUser(userId, 'editor'), ['scope1', 'scope2'])
  //   assert.sameMembers(Roles.getScopesForUser(userId, 'admin'), [])
  //
  //   // by user object
  //   const userObj = Meteor.users.findOneAsync({ _id: userId })
  //   assert.sameMembers(Roles.getScopesForUser(userObj, 'user'), ['scope2'])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, 'editor'), ['scope1', 'scope2'])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, 'admin'), [])
  // })
  //
  // it('getScopesForUser returns [] when not using scopes', function () {
  //   Roles.createRoleAsync('user')
  //   Roles.createRoleAsync('editor')
  //
  //   const userId = users.eve
  //
  //   Roles.addUsersToRolesAsync([users.eve], ['editor', 'user'])
  //
  //   // by userId
  //   assert.sameMembers(Roles.getScopesForUser(userId), [])
  //   assert.sameMembers(Roles.getScopesForUser(userId, 'editor'), [])
  //   assert.sameMembers(Roles.getScopesForUser(userId, ['editor']), [])
  //   assert.sameMembers(Roles.getScopesForUser(userId, ['editor', 'user']), [])
  //
  //   // by user object
  //   const userObj = Meteor.users.findOneAsync({ _id: userId })
  //   assert.sameMembers(Roles.getScopesForUser(userObj), [])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, 'editor'), [])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, ['editor']), [])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, ['editor', 'user']), [])
  // })
  //
  // it('can get all groups for user by role array', function () {
  //   const userId = users.eve
  //
  //   Roles.createRoleAsync('user')
  //   Roles.createRoleAsync('editor')
  //   Roles.createRoleAsync('moderator')
  //   Roles.createRoleAsync('admin')
  //
  //   Roles.addUsersToRolesAsync([users.eve], ['editor'], 'group1')
  //   Roles.addUsersToRolesAsync([users.eve], ['editor', 'user'], 'group2')
  //   Roles.addUsersToRolesAsync([users.eve], ['moderator'], 'group3')
  //
  //   // by userId, one role
  //   assert.sameMembers(Roles.getScopesForUser(userId, ['user']), ['group2'])
  //   assert.sameMembers(Roles.getScopesForUser(userId, ['editor']), ['group1', 'group2'])
  //   assert.sameMembers(Roles.getScopesForUser(userId, ['admin']), [])
  //
  //   // by userId, multiple roles
  //   assert.sameMembers(Roles.getScopesForUser(userId, ['editor', 'user']), ['group1', 'group2'])
  //   assert.sameMembers(Roles.getScopesForUser(userId, ['editor', 'moderator']), ['group1', 'group2', 'group3'])
  //   assert.sameMembers(Roles.getScopesForUser(userId, ['user', 'moderator']), ['group2', 'group3'])
  //
  //   // by user object, one role
  //   const userObj = Meteor.users.findOneAsync({ _id: userId })
  //   assert.sameMembers(Roles.getScopesForUser(userObj, ['user']), ['group2'])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, ['editor']), ['group1', 'group2'])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, ['admin']), [])
  //
  //   // by user object, multiple roles
  //   assert.sameMembers(Roles.getScopesForUser(userObj, ['editor', 'user']), ['group1', 'group2'])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, ['editor', 'moderator']), ['group1', 'group2', 'group3'])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, ['user', 'moderator']), ['group2', 'group3'])
  // })
  //
  // it('getting all scopes for user does not include GLOBAL_SCOPE', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //   Roles.createRoleAsync('editor')
  //
  //   const userId = users.eve
  //
  //   Roles.addUsersToRolesAsync([users.eve], ['editor'], 'scope1')
  //   Roles.addUsersToRolesAsync([users.eve], ['editor', 'user'], 'scope2')
  //   Roles.addUsersToRolesAsync([users.eve], ['editor', 'user', 'admin'], Roles.GLOBAL_SCOPE)
  //
  //   // by userId
  //   assert.sameMembers(Roles.getScopesForUser(userId, 'user'), ['scope2'])
  //   assert.sameMembers(Roles.getScopesForUser(userId, 'editor'), ['scope1', 'scope2'])
  //   assert.sameMembers(Roles.getScopesForUser(userId, 'admin'), [])
  //   assert.sameMembers(Roles.getScopesForUser(userId, ['user']), ['scope2'])
  //   assert.sameMembers(Roles.getScopesForUser(userId, ['editor']), ['scope1', 'scope2'])
  //   assert.sameMembers(Roles.getScopesForUser(userId, ['admin']), [])
  //   assert.sameMembers(Roles.getScopesForUser(userId, ['user', 'editor', 'admin']), ['scope1', 'scope2'])
  //
  //   // by user object
  //   const userObj = Meteor.users.findOneAsync({ _id: userId })
  //   assert.sameMembers(Roles.getScopesForUser(userObj, 'user'), ['scope2'])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, 'editor'), ['scope1', 'scope2'])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, 'admin'), [])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, ['user']), ['scope2'])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, ['editor']), ['scope1', 'scope2'])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, ['admin']), [])
  //   assert.sameMembers(Roles.getScopesForUser(userObj, ['user', 'editor', 'admin']), ['scope1', 'scope2'])
  // })
  //
  // it('can get all users in role', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //   Roles.createRoleAsync('editor')
  //
  //   Roles.addUsersToRolesAsync([users.eve, users.joe], ['admin', 'user'])
  //   Roles.addUsersToRolesAsync([users.bob, users.joe], ['editor'])
  //
  //   const expected = [users.eve, users.joe]
  //   const actual = Roles.getUsersInRole('admin').fetch().map(r => r._id)
  //
  //   assert.sameMembers(actual, expected)
  // })
  //
  // it('can get all users in role by scope', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //
  //   Roles.addUsersToRolesAsync([users.eve, users.joe], ['admin', 'user'], 'scope1')
  //   Roles.addUsersToRolesAsync([users.bob, users.joe], ['admin'], 'scope2')
  //
  //   let expected = [users.eve, users.joe]
  //   let actual = Roles.getUsersInRole('admin', 'scope1').fetch().map(r => r._id)
  //
  //   assert.sameMembers(actual, expected)
  //
  //   expected = [users.eve, users.joe]
  //   actual = Roles.getUsersInRole('admin', { scope: 'scope1' }).fetch().map(r => r._id)
  //   assert.sameMembers(actual, expected)
  //
  //   expected = [users.eve, users.bob, users.joe]
  //   actual = Roles.getUsersInRole('admin', { anyScope: true }).fetch().map(r => r._id)
  //   assert.sameMembers(actual, expected)
  //
  //   actual = Roles.getUsersInRole('admin').fetch().map(r => r._id)
  //   assert.sameMembers(actual, [])
  // })
  //
  // it('can get all users in role by scope including Roles.GLOBAL_SCOPE', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //
  //   Roles.addUsersToRolesAsync([users.eve], ['admin', 'user'], Roles.GLOBAL_SCOPE)
  //   Roles.addUsersToRolesAsync([users.bob, users.joe], ['admin'], 'scope2')
  //
  //   let expected = [users.eve]
  //   let actual = Roles.getUsersInRole('admin', 'scope1').fetch().map(r => r._id)
  //
  //   assert.sameMembers(actual, expected)
  //
  //   expected = [users.eve, users.bob, users.joe]
  //   actual = Roles.getUsersInRole('admin', 'scope2').fetch().map(r => r._id)
  //
  //   assert.sameMembers(actual, expected)
  //
  //   expected = [users.eve]
  //   actual = Roles.getUsersInRole('admin').fetch().map(r => r._id)
  //
  //   assert.sameMembers(actual, expected)
  //
  //   expected = [users.eve, users.bob, users.joe]
  //   actual = Roles.getUsersInRole('admin', { anyScope: true }).fetch().map(r => r._id)
  //
  //   assert.sameMembers(actual, expected)
  // })
  //
  // it('can get all users in role by scope excluding Roles.GLOBAL_SCOPE', function () {
  //   Roles.createRoleAsync('admin')
  //
  //   Roles.addUsersToRolesAsync([users.eve], ['admin'], Roles.GLOBAL_SCOPE)
  //   Roles.addUsersToRolesAsync([users.bob], ['admin'], 'scope1')
  //
  //   let expected = [users.eve]
  //   let actual = Roles.getUsersInRole('admin').fetch().map(r => r._id)
  //   assert.sameMembers(actual, expected)
  //
  //   expected = [users.eve, users.bob]
  //   actual = Roles.getUsersInRole('admin', { scope: 'scope1' }).fetch().map(r => r._id)
  //   assert.sameMembers(actual, expected)
  //
  //   expected = [users.bob]
  //   actual = Roles.getUsersInRole('admin', { scope: 'scope1', onlyScoped: true }).fetch().map(r => r._id)
  //   assert.sameMembers(actual, expected)
  // })

  it('can get all users in role by scope and passes through mongo query arguments', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')

    await Roles.addUsersToRolesAsync([users.eve, users.joe], ['admin', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync([users.bob, users.joe], ['admin'], 'scope2')

    const results = await Roles.getUsersInRole('admin', 'scope1', { fields: { username: 0 }, limit: 1 }).fetch()

    assert.equal(1, results.length)
    assert.isTrue(hasProp(results[0], '_id'))
    assert.isFalse(hasProp(results[0], 'username'))
  })

  // it('can use Roles.GLOBAL_SCOPE to assign blanket roles', function () {
  //   Roles.createRoleAsync('admin')
  //
  //   Roles.addUsersToRolesAsync([users.joe, users.bob], ['admin'], Roles.GLOBAL_SCOPE)
  //
  //   testUser('eve', [], 'scope1')
  //   testUser('joe', ['admin'], 'scope2')
  //   testUser('joe', ['admin'], 'scope1')
  //   testUser('bob', ['admin'], 'scope2')
  //   testUser('bob', ['admin'], 'scope1')
  //
  //   Roles.removeUsersFromRolesAsync(users.joe, ['admin'], Roles.GLOBAL_SCOPE)
  //
  //   testUser('eve', [], 'scope1')
  //   testUser('joe', [], 'scope2')
  //   testUser('joe', [], 'scope1')
  //   testUser('bob', ['admin'], 'scope2')
  //   testUser('bob', ['admin'], 'scope1')
  // })
  //
  // it('Roles.GLOBAL_SCOPE is independent of other scopes', function () {
  //   Roles.createRoleAsync('admin')
  //
  //   Roles.addUsersToRolesAsync([users.joe, users.bob], ['admin'], 'scope5')
  //   Roles.addUsersToRolesAsync([users.joe, users.bob], ['admin'], Roles.GLOBAL_SCOPE)
  //
  //   testUser('eve', [], 'scope1')
  //   testUser('joe', ['admin'], 'scope5')
  //   testUser('joe', ['admin'], 'scope2')
  //   testUser('joe', ['admin'], 'scope1')
  //   testUser('bob', ['admin'], 'scope5')
  //   testUser('bob', ['admin'], 'scope2')
  //   testUser('bob', ['admin'], 'scope1')
  //
  //   Roles.removeUsersFromRolesAsync(users.joe, ['admin'], Roles.GLOBAL_SCOPE)
  //
  //   testUser('eve', [], 'scope1')
  //   testUser('joe', ['admin'], 'scope5')
  //   testUser('joe', [], 'scope2')
  //   testUser('joe', [], 'scope1')
  //   testUser('bob', ['admin'], 'scope5')
  //   testUser('bob', ['admin'], 'scope2')
  //   testUser('bob', ['admin'], 'scope1')
  // })
  //
  // it('Roles.GLOBAL_SCOPE also checked when scope not specified', function () {
  //   Roles.createRoleAsync('admin')
  //
  //   Roles.addUsersToRolesAsync(users.joe, 'admin', Roles.GLOBAL_SCOPE)
  //
  //   testUser('joe', ['admin'])
  //
  //   Roles.removeUsersFromRolesAsync(users.joe, 'admin', Roles.GLOBAL_SCOPE)
  //
  //   testUser('joe', [])
  // })
  //
  // it('can use \'.\' in scope name', function () {
  //   Roles.createRoleAsync('admin')
  //
  //   Roles.addUsersToRolesAsync(users.joe, ['admin'], 'example.com')
  //   testUser('joe', ['admin'], 'example.com')
  // })
  //
  // it('can use multiple periods in scope name', function () {
  //   Roles.createRoleAsync('admin')
  //
  //   Roles.addUsersToRolesAsync(users.joe, ['admin'], 'example.k12.va.us')
  //   testUser('joe', ['admin'], 'example.k12.va.us')
  // })
  //
  // it('renaming of roles', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //   Roles.createRoleAsync('editor')
  //
  //   await Roles.setUserRolesAsync([users.eve, users.bob], ['editor', 'user'], 'scope1')
  //   await Roles.setUserRolesAsync([users.bob, users.joe], ['user', 'admin'], 'scope2')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'editor', 'scope1'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'editor', 'scope2'))
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.joe, 'admin', 'scope1'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.joe, 'admin', 'scope2'))
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'user', 'scope1'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.bob, 'user', 'scope1'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.joe, 'user', 'scope1'))
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'user', 'scope2'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.bob, 'user', 'scope2'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.joe, 'user', 'scope2'))
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'user2', 'scope1'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'user2', 'scope2'))
  //
  //   Roles.renameRole('user', 'user2')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'editor', 'scope1'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'editor', 'scope2'))
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.joe, 'admin', 'scope1'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.joe, 'admin', 'scope2'))
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'user2', 'scope1'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.bob, 'user2', 'scope1'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.joe, 'user2', 'scope1'))
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'user2', 'scope2'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.bob, 'user2', 'scope2'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.joe, 'user2', 'scope2'))
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'user', 'scope1'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'user', 'scope2'))
  // })
  //
  // it('migration without global groups (to v2)', function () {
  //   assert.isOk(Meteor.roles.insert({ name: 'admin' }))
  //   assert.isOk(Meteor.roles.insert({ name: 'editor' }))
  //   assert.isOk(Meteor.roles.insert({ name: 'user' }))
  //
  //   assert.isOk(Meteor.users.update(users.eve, { $set: { roles: ['admin', 'editor'] } }))
  //   assert.isOk(Meteor.users.update(users.bob, { $set: { roles: [] } }))
  //   assert.isOk(Meteor.users.update(users.joe, { $set: { roles: ['user'] } }))
  //
  //   Roles._forwardMigrate()
  //
  //   assert.deepEqual(Meteor.users.findOneAsync(users.eve, { fields: { roles: 1, _id: 0 } }), {
  //     roles: [{
  //       _id: 'admin',
  //       scope: null,
  //       assigned: true
  //     }, {
  //       _id: 'editor',
  //       scope: null,
  //       assigned: true
  //     }]
  //   })
  //   assert.deepEqual(Meteor.users.findOneAsync(users.bob, { fields: { roles: 1, _id: 0 } }), {
  //     roles: []
  //   })
  //   assert.deepEqual(Meteor.users.findOneAsync(users.joe, { fields: { roles: 1, _id: 0 } }), {
  //     roles: [{
  //       _id: 'user',
  //       scope: null,
  //       assigned: true
  //     }]
  //   })
  //
  //   assert.deepEqual(Meteor.roles.findOne({ _id: 'admin' }), {
  //     _id: 'admin',
  //     children: []
  //   })
  //   assert.deepEqual(Meteor.roles.findOne({ _id: 'editor' }), {
  //     _id: 'editor',
  //     children: []
  //   })
  //   assert.deepEqual(Meteor.roles.findOne({ _id: 'user' }), {
  //     _id: 'user',
  //     children: []
  //   })
  //
  //   Roles._backwardMigrate(null, null, false)
  //
  //   assert.deepEqual(Meteor.users.findOneAsync(users.eve, { fields: { roles: 1, _id: 0 } }), {
  //     roles: ['admin', 'editor']
  //   })
  //   assert.deepEqual(Meteor.users.findOneAsync(users.bob, { fields: { roles: 1, _id: 0 } }), {
  //     roles: []
  //   })
  //   assert.deepEqual(Meteor.users.findOneAsync(users.joe, { fields: { roles: 1, _id: 0 } }), {
  //     roles: ['user']
  //   })
  //
  //   assert.deepEqual(Meteor.roles.findOne({ name: 'admin' }, { fields: { _id: 0 } }), {
  //     name: 'admin'
  //   })
  //   assert.deepEqual(Meteor.roles.findOne({ name: 'editor' }, { fields: { _id: 0 } }), {
  //     name: 'editor'
  //   })
  //   assert.deepEqual(Meteor.roles.findOne({ name: 'user' }, { fields: { _id: 0 } }), {
  //     name: 'user'
  //   })
  // })
  //
  // it('migration without global groups (to v3)')
  //
  // it('migration with global groups (to v2)', function () {
  //   assert.isOk(Meteor.roles.insert({ name: 'admin' }))
  //   assert.isOk(Meteor.roles.insert({ name: 'editor' }))
  //   assert.isOk(Meteor.roles.insert({ name: 'user' }))
  //
  //   assert.isOk(Meteor.users.update(users.eve, { $set: { roles: { __global_roles__: ['admin', 'editor'], foo_bla: ['user'] } } }))
  //   assert.isOk(Meteor.users.update(users.bob, { $set: { roles: { } } }))
  //   assert.isOk(Meteor.users.update(users.joe, { $set: { roles: { __global_roles__: ['user'], foo_bla: ['user'] } } }))
  //
  //   Roles._forwardMigrate(null, null, false)
  //
  //   assert.deepEqual(Meteor.users.findOneAsync(users.eve, { fields: { roles: 1, _id: 0 } }), {
  //     roles: [{
  //       _id: 'admin',
  //       scope: null,
  //       assigned: true
  //     }, {
  //       _id: 'editor',
  //       scope: null,
  //       assigned: true
  //     }, {
  //       _id: 'user',
  //       scope: 'foo_bla',
  //       assigned: true
  //     }]
  //   })
  //   assert.deepEqual(Meteor.users.findOneAsync(users.bob, { fields: { roles: 1, _id: 0 } }), {
  //     roles: []
  //   })
  //   assert.deepEqual(Meteor.users.findOneAsync(users.joe, { fields: { roles: 1, _id: 0 } }), {
  //     roles: [{
  //       _id: 'user',
  //       scope: null,
  //       assigned: true
  //     }, {
  //       _id: 'user',
  //       scope: 'foo_bla',
  //       assigned: true
  //     }]
  //   })
  //
  //   assert.deepEqual(Meteor.roles.findOne({ _id: 'admin' }), {
  //     _id: 'admin',
  //     children: []
  //   })
  //   assert.deepEqual(Meteor.roles.findOne({ _id: 'editor' }), {
  //     _id: 'editor',
  //     children: []
  //   })
  //   assert.deepEqual(Meteor.roles.findOne({ _id: 'user' }), {
  //     _id: 'user',
  //     children: []
  //   })
  //
  //   Roles._backwardMigrate(null, null, true)
  //
  //   assert.deepEqual(Meteor.users.findOneAsync(users.eve, { fields: { roles: 1, _id: 0 } }), {
  //     roles: {
  //       __global_roles__: ['admin', 'editor'],
  //       foo_bla: ['user']
  //     }
  //   })
  //   assert.deepEqual(Meteor.users.findOneAsync(users.bob, { fields: { roles: 1, _id: 0 } }), {
  //     roles: {}
  //   })
  //   assert.deepEqual(Meteor.users.findOneAsync(users.joe, { fields: { roles: 1, _id: 0 } }), {
  //     roles: {
  //       __global_roles__: ['user'],
  //       foo_bla: ['user']
  //     }
  //   })
  //
  //   assert.deepEqual(Meteor.roles.findOne({ name: 'admin' }, { fields: { _id: 0 } }), {
  //     name: 'admin'
  //   })
  //   assert.deepEqual(Meteor.roles.findOne({ name: 'editor' }, { fields: { _id: 0 } }), {
  //     name: 'editor'
  //   })
  //   assert.deepEqual(Meteor.roles.findOne({ name: 'user' }, { fields: { _id: 0 } }), {
  //     name: 'user'
  //   })
  //
  //   Roles._forwardMigrate(null, null, true)
  //
  //   assert.deepEqual(Meteor.users.findOneAsync(users.eve, { fields: { roles: 1, _id: 0 } }), {
  //     roles: [{
  //       _id: 'admin',
  //       scope: null,
  //       assigned: true
  //     }, {
  //       _id: 'editor',
  //       scope: null,
  //       assigned: true
  //     }, {
  //       _id: 'user',
  //       scope: 'foo.bla',
  //       assigned: true
  //     }]
  //   })
  //   assert.deepEqual(Meteor.users.findOneAsync(users.bob, { fields: { roles: 1, _id: 0 } }), {
  //     roles: []
  //   })
  //   assert.deepEqual(Meteor.users.findOneAsync(users.joe, { fields: { roles: 1, _id: 0 } }), {
  //     roles: [{
  //       _id: 'user',
  //       scope: null,
  //       assigned: true
  //     }, {
  //       _id: 'user',
  //       scope: 'foo.bla',
  //       assigned: true
  //     }]
  //   })
  //
  //   assert.deepEqual(Meteor.roles.findOne({ _id: 'admin' }), {
  //     _id: 'admin',
  //     children: []
  //   })
  //   assert.deepEqual(Meteor.roles.findOne({ _id: 'editor' }), {
  //     _id: 'editor',
  //     children: []
  //   })
  //   assert.deepEqual(Meteor.roles.findOne({ _id: 'user' }), {
  //     _id: 'user',
  //     children: []
  //   })
  // })
  //
  // it('migration with global groups (to v3)')
  //
  // it('_addUserToRole', function () {
  //   Roles.createRoleAsync('admin')
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [])
  //
  //   assert.include(
  //     Object.keys(Roles._addUserToRole(users.eve, 'admin', { scope: null, ifExists: false })),
  //     'insertedId'
  //   )
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'admin' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }])
  //
  //   assert.notInclude(
  //     Object.keys(Roles._addUserToRole(users.eve, 'admin', { scope: null, ifExists: false })),
  //     'insertedId'
  //   )
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'admin' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }])
  // })
  //
  // it('_removeUserFromRole', function () {
  //   Roles.createRoleAsync('admin')
  //
  //   Roles.addUsersToRolesAsync(users.eve, 'admin')
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'admin' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [{ _id: 'admin' }]
  //   }])
  //
  //   Roles._removeUserFromRole(users.eve, 'admin', { scope: null })
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [])
  // })
  //
  // it('keep assigned roles', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //   Roles.createRoleAsync('ALL_PERMISSIONS')
  //   Roles.createRoleAsync('VIEW_PERMISSION')
  //   Roles.createRoleAsync('EDIT_PERMISSION')
  //   Roles.createRoleAsync('DELETE_PERMISSION')
  //   Roles.addRolesToParent('ALL_PERMISSIONS', 'user')
  //   Roles.addRolesToParent('EDIT_PERMISSION', 'ALL_PERMISSIONS')
  //   Roles.addRolesToParent('VIEW_PERMISSION', 'ALL_PERMISSIONS')
  //   Roles.addRolesToParent('DELETE_PERMISSION', 'admin')
  //
  //   Roles.addUsersToRolesAsync(users.eve, ['user'])
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'VIEW_PERMISSION'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'user' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'user' },
  //       { _id: 'ALL_PERMISSIONS' },
  //       { _id: 'EDIT_PERMISSION' },
  //       { _id: 'VIEW_PERMISSION' }
  //     ]
  //   }])
  //
  //   Roles.addUsersToRolesAsync(users.eve, 'VIEW_PERMISSION')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'VIEW_PERMISSION'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'user' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'user' },
  //       { _id: 'ALL_PERMISSIONS' },
  //       { _id: 'EDIT_PERMISSION' },
  //       { _id: 'VIEW_PERMISSION' }
  //     ]
  //   }, {
  //     role: { _id: 'VIEW_PERMISSION' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'VIEW_PERMISSION' }
  //     ]
  //   }])
  //
  //   Roles.removeUsersFromRolesAsync(users.eve, 'user')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'VIEW_PERMISSION'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'VIEW_PERMISSION' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'VIEW_PERMISSION' }
  //     ]
  //   }])
  //
  //   Roles.removeUsersFromRolesAsync(users.eve, 'VIEW_PERMISSION')
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'VIEW_PERMISSION'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [])
  // })
  //
  // it('adds children of the added role to the assignments', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('ALBUM.ADMIN')
  //   Roles.createRoleAsync('ALBUM.VIEW')
  //   Roles.createRoleAsync('TRACK.ADMIN')
  //   Roles.createRoleAsync('TRACK.VIEW')
  //
  //   Roles.addRolesToParent('ALBUM.VIEW', 'ALBUM.ADMIN')
  //   Roles.addRolesToParent('TRACK.VIEW', 'TRACK.ADMIN')
  //
  //   Roles.addRolesToParent('ALBUM.ADMIN', 'admin')
  //
  //   Roles.addUsersToRolesAsync(users.eve, ['admin'])
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'TRACK.VIEW'))
  //
  //   Roles.addRolesToParent('TRACK.ADMIN', 'admin')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'TRACK.VIEW'))
  // })
  //
  // it('removes children of the removed role from the assignments', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('ALBUM.ADMIN')
  //   Roles.createRoleAsync('ALBUM.VIEW')
  //   Roles.createRoleAsync('TRACK.ADMIN')
  //   Roles.createRoleAsync('TRACK.VIEW')
  //
  //   Roles.addRolesToParent('ALBUM.VIEW', 'ALBUM.ADMIN')
  //   Roles.addRolesToParent('TRACK.VIEW', 'TRACK.ADMIN')
  //
  //   Roles.addRolesToParent('ALBUM.ADMIN', 'admin')
  //   Roles.addRolesToParent('TRACK.ADMIN', 'admin')
  //
  //   Roles.addUsersToRolesAsync(users.eve, ['admin'])
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'TRACK.VIEW'))
  //
  //   Roles.removeRolesFromParent('TRACK.ADMIN', 'admin')
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'TRACK.VIEW'))
  // })
  //
  // it('modify assigned hierarchical roles', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //   Roles.createRoleAsync('ALL_PERMISSIONS')
  //   Roles.createRoleAsync('VIEW_PERMISSION')
  //   Roles.createRoleAsync('EDIT_PERMISSION')
  //   Roles.createRoleAsync('DELETE_PERMISSION')
  //   Roles.addRolesToParent('ALL_PERMISSIONS', 'user')
  //   Roles.addRolesToParent('EDIT_PERMISSION', 'ALL_PERMISSIONS')
  //   Roles.addRolesToParent('VIEW_PERMISSION', 'ALL_PERMISSIONS')
  //   Roles.addRolesToParent('DELETE_PERMISSION', 'admin')
  //
  //   Roles.addUsersToRolesAsync(users.eve, ['user'])
  //   Roles.addUsersToRolesAsync(users.eve, ['ALL_PERMISSIONS'], 'scope')
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'MODERATE_PERMISSION'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'MODERATE_PERMISSION', 'scope'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'user' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'user' },
  //       { _id: 'ALL_PERMISSIONS' },
  //       { _id: 'EDIT_PERMISSION' },
  //       { _id: 'VIEW_PERMISSION' }
  //     ]
  //   }, {
  //     role: { _id: 'ALL_PERMISSIONS' },
  //     scope: 'scope',
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'ALL_PERMISSIONS' },
  //       { _id: 'EDIT_PERMISSION' },
  //       { _id: 'VIEW_PERMISSION' }
  //     ]
  //   }])
  //
  //   Roles.createRoleAsync('MODERATE_PERMISSION')
  //
  //   Roles.addRolesToParent('MODERATE_PERMISSION', 'ALL_PERMISSIONS')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'MODERATE_PERMISSION'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'MODERATE_PERMISSION', 'scope'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'user' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'user' },
  //       { _id: 'ALL_PERMISSIONS' },
  //       { _id: 'EDIT_PERMISSION' },
  //       { _id: 'VIEW_PERMISSION' },
  //       { _id: 'MODERATE_PERMISSION' }
  //     ]
  //   }, {
  //     role: { _id: 'ALL_PERMISSIONS' },
  //     scope: 'scope',
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'ALL_PERMISSIONS' },
  //       { _id: 'EDIT_PERMISSION' },
  //       { _id: 'VIEW_PERMISSION' },
  //       { _id: 'MODERATE_PERMISSION' }
  //     ]
  //   }])
  //
  //   Roles.addUsersToRolesAsync(users.eve, ['admin'])
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION', 'scope'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'user' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'user' },
  //       { _id: 'ALL_PERMISSIONS' },
  //       { _id: 'EDIT_PERMISSION' },
  //       { _id: 'VIEW_PERMISSION' },
  //       { _id: 'MODERATE_PERMISSION' }
  //     ]
  //   }, {
  //     role: { _id: 'ALL_PERMISSIONS' },
  //     scope: 'scope',
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'ALL_PERMISSIONS' },
  //       { _id: 'EDIT_PERMISSION' },
  //       { _id: 'VIEW_PERMISSION' },
  //       { _id: 'MODERATE_PERMISSION' }
  //     ]
  //   }, {
  //     role: { _id: 'admin' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'admin' },
  //       { _id: 'DELETE_PERMISSION' }
  //     ]
  //   }])
  //
  //   Roles.addRolesToParent('DELETE_PERMISSION', 'ALL_PERMISSIONS')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION', 'scope'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'user' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'user' },
  //       { _id: 'ALL_PERMISSIONS' },
  //       { _id: 'EDIT_PERMISSION' },
  //       { _id: 'VIEW_PERMISSION' },
  //       { _id: 'MODERATE_PERMISSION' },
  //       { _id: 'DELETE_PERMISSION' }
  //     ]
  //   }, {
  //     role: { _id: 'ALL_PERMISSIONS' },
  //     scope: 'scope',
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'ALL_PERMISSIONS' },
  //       { _id: 'EDIT_PERMISSION' },
  //       { _id: 'VIEW_PERMISSION' },
  //       { _id: 'MODERATE_PERMISSION' },
  //       { _id: 'DELETE_PERMISSION' }
  //     ]
  //   }, {
  //     role: { _id: 'admin' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'admin' },
  //       { _id: 'DELETE_PERMISSION' }
  //     ]
  //   }])
  //
  //   Roles.removeUsersFromRolesAsync(users.eve, ['admin'])
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION', 'scope'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'user' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'user' },
  //       { _id: 'ALL_PERMISSIONS' },
  //       { _id: 'EDIT_PERMISSION' },
  //       { _id: 'VIEW_PERMISSION' },
  //       { _id: 'MODERATE_PERMISSION' },
  //       { _id: 'DELETE_PERMISSION' }
  //     ]
  //   }, {
  //     role: { _id: 'ALL_PERMISSIONS' },
  //     scope: 'scope',
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'ALL_PERMISSIONS' },
  //       { _id: 'EDIT_PERMISSION' },
  //       { _id: 'VIEW_PERMISSION' },
  //       { _id: 'MODERATE_PERMISSION' },
  //       { _id: 'DELETE_PERMISSION' }
  //     ]
  //   }])
  //
  //   Roles.deleteRole('ALL_PERMISSIONS')
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION', 'scope'))
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'MODERATE_PERMISSION'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'MODERATE_PERMISSION', 'scope'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'user' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'user' }
  //     ]
  //   }])
  // })
  //
  // it('delete role with overlapping hierarchical roles', function () {
  //   Roles.createRoleAsync('role1')
  //   Roles.createRoleAsync('role2')
  //   Roles.createRoleAsync('COMMON_PERMISSION_1')
  //   Roles.createRoleAsync('COMMON_PERMISSION_2')
  //   Roles.createRoleAsync('COMMON_PERMISSION_3')
  //   Roles.createRoleAsync('EXTRA_PERMISSION_ROLE_1')
  //   Roles.createRoleAsync('EXTRA_PERMISSION_ROLE_2')
  //
  //   Roles.addRolesToParent('COMMON_PERMISSION_1', 'role1')
  //   Roles.addRolesToParent('COMMON_PERMISSION_2', 'role1')
  //   Roles.addRolesToParent('COMMON_PERMISSION_3', 'role1')
  //   Roles.addRolesToParent('EXTRA_PERMISSION_ROLE_1', 'role1')
  //
  //   Roles.addRolesToParent('COMMON_PERMISSION_1', 'role2')
  //   Roles.addRolesToParent('COMMON_PERMISSION_2', 'role2')
  //   Roles.addRolesToParent('COMMON_PERMISSION_3', 'role2')
  //   Roles.addRolesToParent('EXTRA_PERMISSION_ROLE_2', 'role2')
  //
  //   Roles.addUsersToRolesAsync(users.eve, 'role1')
  //   Roles.addUsersToRolesAsync(users.eve, 'role2')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'COMMON_PERMISSION_1'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_1'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_2'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'role1' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'role1' },
  //       { _id: 'COMMON_PERMISSION_1' },
  //       { _id: 'COMMON_PERMISSION_2' },
  //       { _id: 'COMMON_PERMISSION_3' },
  //       { _id: 'EXTRA_PERMISSION_ROLE_1' }
  //     ]
  //   }, {
  //     role: { _id: 'role2' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'role2' },
  //       { _id: 'COMMON_PERMISSION_1' },
  //       { _id: 'COMMON_PERMISSION_2' },
  //       { _id: 'COMMON_PERMISSION_3' },
  //       { _id: 'EXTRA_PERMISSION_ROLE_2' }
  //     ]
  //   }])
  //
  //   Roles.removeUsersFromRolesAsync(users.eve, 'role2')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'COMMON_PERMISSION_1'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_1'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_2'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'role1' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'role1' },
  //       { _id: 'COMMON_PERMISSION_1' },
  //       { _id: 'COMMON_PERMISSION_2' },
  //       { _id: 'COMMON_PERMISSION_3' },
  //       { _id: 'EXTRA_PERMISSION_ROLE_1' }
  //     ]
  //   }])
  //
  //   Roles.addUsersToRolesAsync(users.eve, 'role2')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'COMMON_PERMISSION_1'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_1'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_2'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'role1' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'role1' },
  //       { _id: 'COMMON_PERMISSION_1' },
  //       { _id: 'COMMON_PERMISSION_2' },
  //       { _id: 'COMMON_PERMISSION_3' },
  //       { _id: 'EXTRA_PERMISSION_ROLE_1' }
  //     ]
  //   }, {
  //     role: { _id: 'role2' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'role2' },
  //       { _id: 'COMMON_PERMISSION_1' },
  //       { _id: 'COMMON_PERMISSION_2' },
  //       { _id: 'COMMON_PERMISSION_3' },
  //       { _id: 'EXTRA_PERMISSION_ROLE_2' }
  //     ]
  //   }])
  //
  //   Roles.deleteRole('role2')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'COMMON_PERMISSION_1'))
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_1'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_2'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'role1' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [
  //       { _id: 'role1' },
  //       { _id: 'COMMON_PERMISSION_1' },
  //       { _id: 'COMMON_PERMISSION_2' },
  //       { _id: 'COMMON_PERMISSION_3' },
  //       { _id: 'EXTRA_PERMISSION_ROLE_1' }
  //     ]
  //   }])
  // })
  //
  // it('set parent on assigned role', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('EDIT_PERMISSION')
  //
  //   Roles.addUsersToRolesAsync(users.eve, 'EDIT_PERMISSION')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'EDIT_PERMISSION'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'admin'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'EDIT_PERMISSION' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
  //   }])
  //
  //   Roles.addRolesToParent('EDIT_PERMISSION', 'admin')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'EDIT_PERMISSION'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'admin'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'EDIT_PERMISSION' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
  //   }])
  // })
  //
  // it('remove parent on assigned role', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('EDIT_PERMISSION')
  //
  //   Roles.addRolesToParent('EDIT_PERMISSION', 'admin')
  //
  //   Roles.addUsersToRolesAsync(users.eve, 'EDIT_PERMISSION')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'EDIT_PERMISSION'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'admin'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'EDIT_PERMISSION' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
  //   }])
  //
  //   Roles.removeRolesFromParent('EDIT_PERMISSION', 'admin')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'EDIT_PERMISSION'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'admin'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'EDIT_PERMISSION' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
  //   }])
  // })
  //
  // it('adding and removing extra role parents', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //   Roles.createRoleAsync('EDIT_PERMISSION')
  //
  //   Roles.addRolesToParent('EDIT_PERMISSION', 'admin')
  //
  //   Roles.addUsersToRolesAsync(users.eve, 'EDIT_PERMISSION')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'EDIT_PERMISSION'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'admin'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'EDIT_PERMISSION' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
  //   }])
  //
  //   Roles.addRolesToParent('EDIT_PERMISSION', 'user')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'EDIT_PERMISSION'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'admin'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'EDIT_PERMISSION' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
  //   }])
  //
  //   Roles.removeRolesFromParent('EDIT_PERMISSION', 'user')
  //
  //   assert.isTrue(Roles.userIsInRoleAsync(users.eve, 'EDIT_PERMISSION'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'admin'))
  //
  //   assert.sameDeepMembers(await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
  //     role: { _id: 'EDIT_PERMISSION' },
  //     scope: null,
  //     user: { _id: users.eve },
  //     inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
  //   }])
  // })
  //
  // it('cyclic roles', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('editor')
  //   Roles.createRoleAsync('user')
  //
  //   Roles.addRolesToParent('editor', 'admin')
  //   Roles.addRolesToParent('user', 'editor')
  //
  //   assert.throws(function () {
  //     Roles.addRolesToParent('admin', 'user')
  //   }, /form a cycle/)
  // })
  //
  // it('userIsInRole returns false for unknown roles', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //   Roles.createRoleAsync('editor')
  //   Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'])
  //   Roles.addUsersToRolesAsync(users.eve, ['editor'])
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'unknown'))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, []))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, null))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, undefined))
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, 'unknown', { anyScope: true }))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, [], { anyScope: true }))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, null, { anyScope: true }))
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, undefined, { anyScope: true }))
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(users.eve, ['Role1', 'Role2', undefined], 'GroupName'))
  // })
  //
  // it('userIsInRole returns false if user is a function', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.addUsersToRolesAsync(users.eve, ['admin'])
  //
  //   assert.isFalse(Roles.userIsInRoleAsync(() => {}, 'admin'))
  // })
  //
  // describe('isParentOf', function () {
  //   it('returns false for unknown roles', function () {
  //     Roles.createRoleAsync('admin')
  //
  //     assert.isFalse(Roles.isParentOf('admin', 'unknown'))
  //     assert.isFalse(Roles.isParentOf('admin', null))
  //     assert.isFalse(Roles.isParentOf('admin', undefined))
  //
  //     assert.isFalse(Roles.isParentOf('unknown', 'admin'))
  //     assert.isFalse(Roles.isParentOf(null, 'admin'))
  //     assert.isFalse(Roles.isParentOf(undefined, 'admin'))
  //   })
  //
  //   it('returns false if role is not parent of', function () {
  //     Roles.createRoleAsync('admin')
  //     Roles.createRoleAsync('editor')
  //     Roles.createRoleAsync('user')
  //     Roles.addRolesToParent(['editor'], 'admin')
  //     Roles.addRolesToParent(['user'], 'editor')
  //
  //     assert.isFalse(Roles.isParentOf('user', 'admin'))
  //     assert.isFalse(Roles.isParentOf('editor', 'admin'))
  //   })
  //
  //   it('returns true if role is parent of the demanded role', function () {
  //     Roles.createRoleAsync('admin')
  //     Roles.createRoleAsync('editor')
  //     Roles.createRoleAsync('user')
  //     Roles.addRolesToParent(['editor'], 'admin')
  //     Roles.addRolesToParent(['user'], 'editor')
  //
  //     assert.isTrue(Roles.isParentOf('admin', 'user'))
  //     assert.isTrue(Roles.isParentOf('editor', 'user'))
  //     assert.isTrue(Roles.isParentOf('admin', 'editor'))
  //
  //     assert.isTrue(Roles.isParentOf('admin', 'admin'))
  //     assert.isTrue(Roles.isParentOf('editor', 'editor'))
  //     assert.isTrue(Roles.isParentOf('user', 'user'))
  //   })
  // })
})
