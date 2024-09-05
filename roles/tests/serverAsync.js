/* eslint-env mocha */
/* global Roles */

import { Meteor } from 'meteor/meteor'
import chai, { assert } from 'chai'
import chaiAsPromised from 'chai-as-promised'

// To ensure that the files are loaded for coverage
import '../roles_common_async'

chai.use(chaiAsPromised)

// Publication for the client tests
Meteor.publish('client_assignments', async () => {
  return Meteor.roleAssignment.find()
})

// To allow inserting on the client, needed for testing.
if (Meteor.release.split('@')[1][0] === '2') {
  Meteor.roleAssignment.allow({
    insert () { return true },
    update () { return true },
    remove () { return true }
  })
} else {
  // Meteor 3+
  Meteor.roleAssignment.allow({
    insert () { return true },
    insertAsync () { return true },
    update () { return true },
    updateAsync () { return true },
    remove () { return true },
    removeAsync () { return true }
  })
}

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
    await assert.isRejected(Roles.createRoleAsync(''), /Invalid role name/)
    await assert.isRejected(Roles.createRoleAsync(null), /Invalid role name/)
    await assert.isRejected(Roles.createRoleAsync(' '), /Invalid role name/)
    await assert.isRejected(Roles.createRoleAsync(' foobar'), /Invalid role name/)
    await assert.isRejected(Roles.createRoleAsync(' foobar '), /Invalid role name/)
  })

  it('can\'t use invalid scope names', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')
    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync(users.eve, ['editor'], 'scope2')

    await assert.isRejected(Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], ''), /Invalid scope name/)
    await assert.isRejected(Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], ' '), /Invalid scope name/)
    await assert.isRejected(Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], ' foobar'), /Invalid scope name/)
    await assert.isRejected(Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], ' foobar '), /Invalid scope name/)
    await assert.isRejected(Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], 42), /Invalid scope name/)
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

  it('can check if user is in role by scope with global role', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')
    await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync(users.eve, ['editor'], 'scope2')
    await Roles.addUsersToRolesAsync(users.eve, ['admin'])

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, ['user'], 'scope1'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, ['editor'], 'scope2'))

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['user']))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['editor']))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['user'], null))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['editor'], null))

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['user'], 'scope2'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['editor'], 'scope1'))

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, ['admin'], 'scope2'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, ['admin'], 'scope1'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, ['admin']))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, ['admin'], null))
  })

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

    await assert.isRejected(Roles.renameScopeAsync('scope3'), /Invalid scope name/)

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
    await assert.isRejected(Roles.addUsersToRolesAsync(users.eve, ['admin']), /Role 'admin' does not exist/)
    await Roles.addUsersToRolesAsync(users.eve, ['admin'], { ifExists: true })
  })

  it('can\'t set non-existent user to role', async function () {
    await Roles.createRoleAsync('admin')

    await Roles.setUserRolesAsync(['1'], ['admin'])
    assert.equal(await Meteor.users.findOneAsync({ _id: '1' }), undefined)
  })

  it('can\'t set user to non-existent role', async function () {
    await assert.isRejected(Roles.setUserRolesAsync(users.eve, ['admin']), /Role 'admin' does not exist/)
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
    const fetchAll = await Roles.getAllRoles().fetchAsync()
    const actual = fetchAll.map(r => r._id)

    assert.sameMembers(actual, expected)

    const fetchSorted = await Roles.getAllRoles({ sort: { _id: -1 } }).fetchAsync()
    assert.sameMembers(fetchSorted.map(r => r._id), expected.reverse())
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

  it('can get all roles for user', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')

    const userId = users.eve
    let userObj

    // by userId
    assert.sameMembers(await Roles.getRolesForUserAsync(userId), [])

    // by user object
    userObj = await Meteor.users.findOneAsync({ _id: userId })
    assert.sameMembers(await Roles.getRolesForUserAsync(userObj), [])

    await Roles.addUsersToRolesAsync(userId, ['admin', 'user'])

    // by userId
    assert.sameMembers(await Roles.getRolesForUserAsync(userId), ['admin', 'user'])

    // by user object
    userObj = await Meteor.users.findOneAsync({ _id: userId })
    assert.sameMembers(await Roles.getRolesForUserAsync(userObj), ['admin', 'user'])

    const userRoles = await Roles.getRolesForUserAsync(userId, { fullObjects: true })
    assert.sameDeepMembers(userRoles.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: null,
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }, {
      role: { _id: 'user' },
      scope: null,
      user: { _id: userId },
      inheritedRoles: [{ _id: 'user' }]
    }])
  })

  it('can get all roles for user by scope', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')

    const userId = users.eve
    let userObj

    // by userId
    assert.sameMembers(await Roles.getRolesForUserAsync(userId, 'scope1'), [])

    // by user object
    userObj = await Meteor.users.findOneAsync({ _id: userId })
    assert.sameMembers(await Roles.getRolesForUserAsync(userObj, 'scope1'), [])

    // add roles
    await Roles.addUsersToRolesAsync(userId, ['admin', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync(userId, ['admin'], 'scope2')

    // by userId
    assert.sameMembers(await Roles.getRolesForUserAsync(userId, 'scope1'), ['admin', 'user'])
    assert.sameMembers(await Roles.getRolesForUserAsync(userId, 'scope2'), ['admin'])
    assert.sameMembers(await Roles.getRolesForUserAsync(userId), [])

    // by user object
    userObj = await Meteor.users.findOneAsync({ _id: userId })
    assert.sameMembers(await Roles.getRolesForUserAsync(userObj, 'scope1'), ['admin', 'user'])
    assert.sameMembers(await Roles.getRolesForUserAsync(userObj, 'scope2'), ['admin'])
    assert.sameMembers(await Roles.getRolesForUserAsync(userObj), [])

    const userRoles = await Roles.getRolesForUserAsync(userId, { fullObjects: true, scope: 'scope1' })
    assert.sameDeepMembers(userRoles.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: 'scope1',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }, {
      role: { _id: 'user' },
      scope: 'scope1',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'user' }]
    }])
    const userRoles2 = await Roles.getRolesForUserAsync(userId, { fullObjects: true, scope: 'scope2' })
    assert.sameDeepMembers(userRoles2.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: 'scope2',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }])

    const userRoles3 = await Roles.getRolesForUserAsync(userId, { fullObjects: true, anyScope: true })
    assert.sameDeepMembers(userRoles3.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: 'scope1',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }, {
      role: { _id: 'user' },
      scope: 'scope1',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'user' }]
    }, {
      role: { _id: 'admin' },
      scope: 'scope2',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }])

    await Roles.createRoleAsync('PERMISSION')
    await Roles.addRolesToParentAsync('PERMISSION', 'user')

    const userRoles4 = await Roles.getRolesForUserAsync(userId, { fullObjects: true, scope: 'scope1' })
    assert.sameDeepMembers(userRoles4.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: 'scope1',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }, {
      role: { _id: 'user' },
      scope: 'scope1',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'user' }, { _id: 'PERMISSION' }]
    }])
    const userRoles5 = await Roles.getRolesForUserAsync(userId, { fullObjects: true, scope: 'scope2' })
    assert.sameDeepMembers(userRoles5.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: 'scope2',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }])
    assert.sameMembers(await Roles.getRolesForUserAsync(userId, { scope: 'scope1' }), ['admin', 'user', 'PERMISSION'])
    assert.sameMembers(await Roles.getRolesForUserAsync(userId, { scope: 'scope2' }), ['admin'])

    const userRoles6 = await Roles.getRolesForUserAsync(userId, { fullObjects: true, anyScope: true })
    assert.sameDeepMembers(userRoles6.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: 'scope1',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }, {
      role: { _id: 'user' },
      scope: 'scope1',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'user' }, { _id: 'PERMISSION' }]
    }, {
      role: { _id: 'admin' },
      scope: 'scope2',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }])
    assert.sameMembers(await Roles.getRolesForUserAsync(userId, { anyScope: true }), ['admin', 'user', 'PERMISSION'])

    const userRoles7 = await Roles.getRolesForUserAsync(userId, { fullObjects: true, scope: 'scope1', onlyAssigned: true })
    assert.sameDeepMembers(userRoles7.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: 'scope1',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }, {
      role: { _id: 'user' },
      scope: 'scope1',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'user' }, { _id: 'PERMISSION' }]
    }])
    const userRoles8 = await Roles.getRolesForUserAsync(userId, { fullObjects: true, scope: 'scope2', onlyAssigned: true })
    assert.sameDeepMembers(userRoles8.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: 'scope2',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }])
    assert.sameMembers(await Roles.getRolesForUserAsync(userId, { scope: 'scope1', onlyAssigned: true }), ['admin', 'user'])
    assert.sameMembers(await Roles.getRolesForUserAsync(userId, { scope: 'scope2', onlyAssigned: true }), ['admin'])

    const userRoles9 = await Roles.getRolesForUserAsync(userId, { fullObjects: true, anyScope: true, onlyAssigned: true })
    assert.sameDeepMembers(userRoles9.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: 'scope1',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }, {
      role: { _id: 'user' },
      scope: 'scope1',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'user' }, { _id: 'PERMISSION' }]
    }, {
      role: { _id: 'admin' },
      scope: 'scope2',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }])
    assert.sameMembers(await Roles.getRolesForUserAsync(userId, { anyScope: true, onlyAssigned: true }), ['admin', 'user'])
  })

  it('can get only scoped roles for user', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')

    const userId = users.eve

    // add roles
    await Roles.addUsersToRolesAsync(userId, ['user'], 'scope1')
    await Roles.addUsersToRolesAsync(userId, ['admin'])

    await Roles.createRoleAsync('PERMISSION')
    await Roles.addRolesToParentAsync('PERMISSION', 'user')

    assert.sameMembers(await Roles.getRolesForUserAsync(userId, { onlyScoped: true, scope: 'scope1' }), ['user', 'PERMISSION'])
    assert.sameMembers(await Roles.getRolesForUserAsync(userId, { onlyScoped: true, onlyAssigned: true, scope: 'scope1' }), ['user'])
    const userRoles = await Roles.getRolesForUserAsync(userId, { onlyScoped: true, fullObjects: true, scope: 'scope1' })
    assert.sameDeepMembers(userRoles.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'user' },
      scope: 'scope1',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'user' }, { _id: 'PERMISSION' }]
    }])
  })

  it('can get all roles for user by scope with periods in name', async function () {
    await Roles.createRoleAsync('admin')

    await Roles.addUsersToRolesAsync(users.joe, ['admin'], 'example.k12.va.us')

    assert.sameMembers(await Roles.getRolesForUserAsync(users.joe, 'example.k12.va.us'), ['admin'])
  })

  it('can get all roles for user by scope including Roles.GLOBAL_SCOPE', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    const userId = users.eve

    await Roles.addUsersToRolesAsync([users.eve], ['editor'], Roles.GLOBAL_SCOPE)
    await Roles.addUsersToRolesAsync([users.eve], ['admin', 'user'], 'scope1')

    // by userId
    assert.sameMembers(await Roles.getRolesForUserAsync(userId, 'scope1'), ['editor', 'admin', 'user'])
    assert.sameMembers(await Roles.getRolesForUserAsync(userId), ['editor'])

    // by user object
    const userObj = await Meteor.users.findOneAsync({ _id: userId })
    assert.sameMembers(await Roles.getRolesForUserAsync(userObj, 'scope1'), ['editor', 'admin', 'user'])
    assert.sameMembers(await Roles.getRolesForUserAsync(userObj), ['editor'])
  })

  describe('getRolesForUser', function () {
    it('should not return null entries if user has no roles for scope', async function () {
      await Roles.createRoleAsync('editor')

      const userId = users.eve
      let userObj

      // by userId
      assert.sameMembers(await Roles.getRolesForUserAsync(userId, 'scope1'), [])
      assert.sameMembers(await Roles.getRolesForUserAsync(userId), [])

      // by user object
      userObj = await Meteor.users.findOneAsync({ _id: userId })
      assert.sameMembers(await Roles.getRolesForUserAsync(userObj, 'scope1'), [])
      assert.sameMembers(await Roles.getRolesForUserAsync(userObj), [])

      await Roles.addUsersToRolesAsync([users.eve], ['editor'], Roles.GLOBAL_SCOPE)

      // by userId
      assert.sameMembers(await Roles.getRolesForUserAsync(userId, 'scope1'), ['editor'])
      assert.sameMembers(await Roles.getRolesForUserAsync(userId), ['editor'])

      // by user object
      userObj = await Meteor.users.findOneAsync({ _id: userId })
      assert.sameMembers(await Roles.getRolesForUserAsync(userObj, 'scope1'), ['editor'])
      assert.sameMembers(await Roles.getRolesForUserAsync(userObj), ['editor'])
    })

    it('should not fail during a call of addUsersToRoles', async function () {
      await Roles.createRoleAsync('editor')

      const userId = users.eve
      const promises = []
      const interval = setInterval(() => {
        promises.push(Promise.resolve().then(async () => {
          await Roles.getRolesForUserAsync(userId)
        }))
      }, 0)

      await Roles.addUsersToRolesAsync([users.eve], ['editor'], Roles.GLOBAL_SCOPE)
      clearInterval(interval)

      return Promise.all(promises)
    })
  })

  it('returns an empty list of scopes for null as user-id', async function () {
    assert.sameMembers(await Roles.getScopesForUserAsync(undefined), [])
    assert.sameMembers(await Roles.getScopesForUserAsync(null), [])
    assert.sameMembers(await Roles.getScopesForUserAsync('foo'), [])
    assert.sameMembers(await Roles.getScopesForUserAsync({}), [])
    assert.sameMembers(await Roles.getScopesForUserAsync({ _id: 'foo' }), [])
  })

  it('can get all scopes for user', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    const userId = users.eve

    await Roles.addUsersToRolesAsync([users.eve], ['editor'], 'scope1')
    await Roles.addUsersToRolesAsync([users.eve], ['admin', 'user'], 'scope2')

    // by userId
    assert.sameMembers(await Roles.getScopesForUserAsync(userId), ['scope1', 'scope2'])

    // by user object
    const userObj = await Meteor.users.findOneAsync({ _id: userId })
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj), ['scope1', 'scope2'])
  })

  it('can get all scopes for user by role', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    const userId = users.eve

    await Roles.addUsersToRolesAsync([users.eve], ['editor'], 'scope1')
    await Roles.addUsersToRolesAsync([users.eve], ['editor', 'user'], 'scope2')

    // by userId
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, 'user'), ['scope2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, 'editor'), ['scope1', 'scope2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, 'admin'), [])

    // by user object
    const userObj = await Meteor.users.findOneAsync({ _id: userId })
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, 'user'), ['scope2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, 'editor'), ['scope1', 'scope2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, 'admin'), [])
  })

  it('getScopesForUser returns [] when not using scopes', async function () {
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    const userId = users.eve

    await Roles.addUsersToRolesAsync([users.eve], ['editor', 'user'])

    // by userId
    assert.sameMembers(await Roles.getScopesForUserAsync(userId), [])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, 'editor'), [])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, ['editor']), [])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, ['editor', 'user']), [])

    // by user object
    const userObj = await Meteor.users.findOneAsync({ _id: userId })
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj), [])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, 'editor'), [])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, ['editor']), [])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, ['editor', 'user']), [])
  })

  it('can get all groups for user by role array', async function () {
    const userId = users.eve

    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')
    await Roles.createRoleAsync('moderator')
    await Roles.createRoleAsync('admin')

    await Roles.addUsersToRolesAsync([users.eve], ['editor'], 'group1')
    await Roles.addUsersToRolesAsync([users.eve], ['editor', 'user'], 'group2')
    await Roles.addUsersToRolesAsync([users.eve], ['moderator'], 'group3')

    // by userId, one role
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, ['user']), ['group2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, ['editor']), ['group1', 'group2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, ['admin']), [])

    // by userId, multiple roles
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, ['editor', 'user']), ['group1', 'group2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, ['editor', 'moderator']), ['group1', 'group2', 'group3'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, ['user', 'moderator']), ['group2', 'group3'])

    // by user object, one role
    const userObj = await Meteor.users.findOneAsync({ _id: userId })
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, ['user']), ['group2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, ['editor']), ['group1', 'group2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, ['admin']), [])

    // by user object, multiple roles
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, ['editor', 'user']), ['group1', 'group2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, ['editor', 'moderator']), ['group1', 'group2', 'group3'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, ['user', 'moderator']), ['group2', 'group3'])
  })

  it('getting all scopes for user does not include GLOBAL_SCOPE', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    const userId = users.eve

    await Roles.addUsersToRolesAsync([users.eve], ['editor'], 'scope1')
    await Roles.addUsersToRolesAsync([users.eve], ['editor', 'user'], 'scope2')
    await Roles.addUsersToRolesAsync([users.eve], ['editor', 'user', 'admin'], Roles.GLOBAL_SCOPE)

    // by userId
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, 'user'), ['scope2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, 'editor'), ['scope1', 'scope2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, 'admin'), [])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, ['user']), ['scope2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, ['editor']), ['scope1', 'scope2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, ['admin']), [])
    assert.sameMembers(await Roles.getScopesForUserAsync(userId, ['user', 'editor', 'admin']), ['scope1', 'scope2'])

    // by user object
    const userObj = await Meteor.users.findOneAsync({ _id: userId })
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, 'user'), ['scope2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, 'editor'), ['scope1', 'scope2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, 'admin'), [])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, ['user']), ['scope2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, ['editor']), ['scope1', 'scope2'])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, ['admin']), [])
    assert.sameMembers(await Roles.getScopesForUserAsync(userObj, ['user', 'editor', 'admin']), ['scope1', 'scope2'])
  })

  it('can get all users in role', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    await Roles.addUsersToRolesAsync([users.eve, users.joe], ['admin', 'user'])
    await Roles.addUsersToRolesAsync([users.bob, users.joe], ['editor'])

    const expected = [users.eve, users.joe]
    const cursor = await Roles.getUsersInRoleAsync('admin')
    const fetched = await cursor.fetchAsync()
    const actual = fetched.map(r => r._id)

    assert.sameMembers(actual, expected)
  })

  it('can get all users in role by scope', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')

    await Roles.addUsersToRolesAsync([users.eve, users.joe], ['admin', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync([users.bob, users.joe], ['admin'], 'scope2')

    let expected = [users.eve, users.joe]
    const cursor1 = await Roles.getUsersInRoleAsync('admin', 'scope1')
    const fetched1 = await cursor1.fetchAsync()
    let actual = fetched1.map(r => r._id)

    assert.sameMembers(actual, expected)

    expected = [users.eve, users.joe]
    const cursor2 = await Roles.getUsersInRoleAsync('admin', { scope: 'scope1' })
    const fetched2 = await cursor2.fetchAsync()
    actual = fetched2.map(r => r._id)
    assert.sameMembers(actual, expected)

    expected = [users.eve, users.bob, users.joe]
    const cursor3 = await Roles.getUsersInRoleAsync('admin', { anyScope: true })
    const fetched3 = await cursor3.fetchAsync()
    actual = fetched3.map(r => r._id)
    assert.sameMembers(actual, expected)

    const cursor4 = await Roles.getUsersInRoleAsync('admin')
    const fetched4 = await cursor4.fetchAsync()
    actual = fetched4.map(r => r._id)
    assert.sameMembers(actual, [])
  })

  // it('can get all users in role by scope including Roles.GLOBAL_SCOPE', function () {
  //   Roles.createRoleAsync('admin')
  //   Roles.createRoleAsync('user')
  //
  //   Roles.addUsersToRolesAsync([users.eve], ['admin', 'user'], Roles.GLOBAL_SCOPE)
  //   Roles.addUsersToRolesAsync([users.bob, users.joe], ['admin'], 'scope2')
  //
  //   let expected = [users.eve]
  //   let actual = await Roles.getUsersInRoleAsync('admin', 'scope1').fetch().map(r => r._id)
  //
  //   assert.sameMembers(actual, expected)
  //
  //   expected = [users.eve, users.bob, users.joe]
  //   actual = await Roles.getUsersInRoleAsync('admin', 'scope2').fetch().map(r => r._id)
  //
  //   assert.sameMembers(actual, expected)
  //
  //   expected = [users.eve]
  //   actual = await Roles.getUsersInRoleAsync('admin').fetch().map(r => r._id)
  //
  //   assert.sameMembers(actual, expected)
  //
  //   expected = [users.eve, users.bob, users.joe]
  //   actual = await Roles.getUsersInRoleAsync('admin', { anyScope: true }).fetch().map(r => r._id)
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
  //   let actual = await Roles.getUsersInRoleAsync('admin').fetch().map(r => r._id)
  //   assert.sameMembers(actual, expected)
  //
  //   expected = [users.eve, users.bob]
  //   actual = await Roles.getUsersInRoleAsync('admin', { scope: 'scope1' }).fetch().map(r => r._id)
  //   assert.sameMembers(actual, expected)
  //
  //   expected = [users.bob]
  //   actual = await Roles.getUsersInRoleAsync('admin', { scope: 'scope1', onlyScoped: true }).fetch().map(r => r._id)
  //   assert.sameMembers(actual, expected)
  // })

  it('can get all users in role by scope and passes through mongo query arguments', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')

    await Roles.addUsersToRolesAsync([users.eve, users.joe], ['admin', 'user'], 'scope1')
    await Roles.addUsersToRolesAsync([users.bob, users.joe], ['admin'], 'scope2')

    const cursor = await Roles.getUsersInRoleAsync('admin', 'scope1', { fields: { username: 0 }, limit: 1 })
    const results = await cursor.fetchAsync()

    assert.equal(1, results.length)
    assert.isTrue(hasProp(results[0], '_id'))
    assert.isFalse(hasProp(results[0], 'username'))
  })

  it('can use Roles.GLOBAL_SCOPE to assign blanket roles', async function () {
    await Roles.createRoleAsync('admin')

    await Roles.addUsersToRolesAsync([users.joe, users.bob], ['admin'], Roles.GLOBAL_SCOPE)

    await testUser('eve', [], 'scope1')
    await testUser('joe', ['admin'], 'scope2')
    await testUser('joe', ['admin'], 'scope1')
    await testUser('bob', ['admin'], 'scope2')
    await testUser('bob', ['admin'], 'scope1')

    await Roles.removeUsersFromRolesAsync(users.joe, ['admin'], Roles.GLOBAL_SCOPE)

    await testUser('eve', [], 'scope1')
    await testUser('joe', [], 'scope2')
    await testUser('joe', [], 'scope1')
    await testUser('bob', ['admin'], 'scope2')
    await testUser('bob', ['admin'], 'scope1')
  })

  it('Roles.GLOBAL_SCOPE is independent of other scopes', async function () {
    await Roles.createRoleAsync('admin')

    await Roles.addUsersToRolesAsync([users.joe, users.bob], ['admin'], 'scope5')
    await Roles.addUsersToRolesAsync([users.joe, users.bob], ['admin'], Roles.GLOBAL_SCOPE)

    await testUser('eve', [], 'scope1')
    await testUser('joe', ['admin'], 'scope5')
    await testUser('joe', ['admin'], 'scope2')
    await testUser('joe', ['admin'], 'scope1')
    await testUser('bob', ['admin'], 'scope5')
    await testUser('bob', ['admin'], 'scope2')
    await testUser('bob', ['admin'], 'scope1')

    await Roles.removeUsersFromRolesAsync(users.joe, ['admin'], Roles.GLOBAL_SCOPE)

    await testUser('eve', [], 'scope1')
    await testUser('joe', ['admin'], 'scope5')
    await testUser('joe', [], 'scope2')
    await testUser('joe', [], 'scope1')
    await testUser('bob', ['admin'], 'scope5')
    await testUser('bob', ['admin'], 'scope2')
    await testUser('bob', ['admin'], 'scope1')
  })

  it('Roles.GLOBAL_SCOPE also checked when scope not specified', async function () {
    await Roles.createRoleAsync('admin')

    await Roles.addUsersToRolesAsync(users.joe, 'admin', Roles.GLOBAL_SCOPE)

    await testUser('joe', ['admin'])

    await Roles.removeUsersFromRolesAsync(users.joe, 'admin', Roles.GLOBAL_SCOPE)

    await testUser('joe', [])
  })

  it('can use \'.\' in scope name', async function () {
    await Roles.createRoleAsync('admin')

    await Roles.addUsersToRolesAsync(users.joe, ['admin'], 'example.com')
    await testUser('joe', ['admin'], 'example.com')
  })

  it('can use multiple periods in scope name', async function () {
    await Roles.createRoleAsync('admin')

    await Roles.addUsersToRolesAsync(users.joe, ['admin'], 'example.k12.va.us')
    await testUser('joe', ['admin'], 'example.k12.va.us')
  })

  it('renaming of roles', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('editor')

    await Roles.setUserRolesAsync([users.eve, users.bob], ['editor', 'user'], 'scope1')
    await Roles.setUserRolesAsync([users.bob, users.joe], ['user', 'admin'], 'scope2')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'editor', 'scope1'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'editor', 'scope2'))

    assert.isFalse(await Roles.userIsInRoleAsync(users.joe, 'admin', 'scope1'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.joe, 'admin', 'scope2'))

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'user', 'scope1'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.bob, 'user', 'scope1'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.joe, 'user', 'scope1'))

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'user', 'scope2'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.bob, 'user', 'scope2'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.joe, 'user', 'scope2'))

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'user2', 'scope1'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'user2', 'scope2'))

    await Roles.renameRoleAsync('user', 'user2')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'editor', 'scope1'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'editor', 'scope2'))

    assert.isFalse(await Roles.userIsInRoleAsync(users.joe, 'admin', 'scope1'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.joe, 'admin', 'scope2'))

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'user2', 'scope1'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.bob, 'user2', 'scope1'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.joe, 'user2', 'scope1'))

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'user2', 'scope2'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.bob, 'user2', 'scope2'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.joe, 'user2', 'scope2'))

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'user', 'scope1'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'user', 'scope2'))
  })

  it('_addUserToRole', async function () {
    await Roles.createRoleAsync('admin')

    const userRoles = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(userRoles.map(obj => { delete obj._id; return obj }), [])

    const roles = await Roles._addUserToRoleAsync(users.eve, 'admin', { scope: null, ifExists: false })
    assert.hasAnyKeys(roles, 'insertedId')

    const userRoles2 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(userRoles2.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'admin' }]
    }])

    const roles2 = await Roles._addUserToRoleAsync(users.eve, 'admin', { scope: null, ifExists: false })
    assert.hasAnyKeys(roles2, 'insertedId')

    const roles3 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(roles3.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'admin' }]
    }])
  })

  it('_removeUserFromRole', async function () {
    await Roles.createRoleAsync('admin')

    await Roles.addUsersToRolesAsync(users.eve, 'admin')

    const rolesForUser = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(rolesForUser.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'admin' }]
    }])

    await Roles._removeUserFromRoleAsync(users.eve, 'admin', { scope: null })

    const rolesForUser2 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(rolesForUser2.map(obj => { delete obj._id; return obj }), [])
  })

  it('keep assigned roles', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('ALL_PERMISSIONS')
    await Roles.createRoleAsync('VIEW_PERMISSION')
    await Roles.createRoleAsync('EDIT_PERMISSION')
    await Roles.createRoleAsync('DELETE_PERMISSION')
    await Roles.addRolesToParentAsync('ALL_PERMISSIONS', 'user')
    await Roles.addRolesToParentAsync('EDIT_PERMISSION', 'ALL_PERMISSIONS')
    await Roles.addRolesToParentAsync('VIEW_PERMISSION', 'ALL_PERMISSIONS')
    await Roles.addRolesToParentAsync('DELETE_PERMISSION', 'admin')

    await Roles.addUsersToRolesAsync(users.eve, ['user'])

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'VIEW_PERMISSION'))

    const rolesForUser = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(rolesForUser.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'user' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'user' },
        { _id: 'ALL_PERMISSIONS' },
        { _id: 'EDIT_PERMISSION' },
        { _id: 'VIEW_PERMISSION' }
      ]
    }])

    await Roles.addUsersToRolesAsync(users.eve, 'VIEW_PERMISSION')

    assert.eventually.isTrue(Roles.userIsInRoleAsync(users.eve, 'VIEW_PERMISSION'))

    const rolesForUser2 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(rolesForUser2.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'user' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'user' },
        { _id: 'ALL_PERMISSIONS' },
        { _id: 'EDIT_PERMISSION' },
        { _id: 'VIEW_PERMISSION' }
      ]
    }, {
      role: { _id: 'VIEW_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'VIEW_PERMISSION' }
      ]
    }])

    await Roles.removeUsersFromRolesAsync(users.eve, 'user')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'VIEW_PERMISSION'))

    const rolesForUser3 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(rolesForUser3.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'VIEW_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'VIEW_PERMISSION' }
      ]
    }])

    await Roles.removeUsersFromRolesAsync(users.eve, 'VIEW_PERMISSION')

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'VIEW_PERMISSION'))

    const rolesForUser4 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(rolesForUser4.map(obj => { delete obj._id; return obj }), [])
  })

  it('adds children of the added role to the assignments', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('ALBUM.ADMIN')
    await Roles.createRoleAsync('ALBUM.VIEW')
    await Roles.createRoleAsync('TRACK.ADMIN')
    await Roles.createRoleAsync('TRACK.VIEW')

    await Roles.addRolesToParentAsync('ALBUM.VIEW', 'ALBUM.ADMIN')
    await Roles.addRolesToParentAsync('TRACK.VIEW', 'TRACK.ADMIN')

    await Roles.addRolesToParentAsync('ALBUM.ADMIN', 'admin')

    await Roles.addUsersToRolesAsync(users.eve, ['admin'])

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'TRACK.VIEW'))

    await Roles.addRolesToParentAsync('TRACK.ADMIN', 'admin')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'TRACK.VIEW'))
  })

  it('removes children of the removed role from the assignments', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('ALBUM.ADMIN')
    await Roles.createRoleAsync('ALBUM.VIEW')
    await Roles.createRoleAsync('TRACK.ADMIN')
    await Roles.createRoleAsync('TRACK.VIEW')

    await Roles.addRolesToParentAsync('ALBUM.VIEW', 'ALBUM.ADMIN')
    await Roles.addRolesToParentAsync('TRACK.VIEW', 'TRACK.ADMIN')

    await Roles.addRolesToParentAsync('ALBUM.ADMIN', 'admin')
    await Roles.addRolesToParentAsync('TRACK.ADMIN', 'admin')

    await Roles.addUsersToRolesAsync(users.eve, ['admin'])

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'TRACK.VIEW'))

    await Roles.removeRolesFromParentAsync('TRACK.ADMIN', 'admin')

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'TRACK.VIEW'))
  })

  it('modify assigned hierarchical roles', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('ALL_PERMISSIONS')
    await Roles.createRoleAsync('VIEW_PERMISSION')
    await Roles.createRoleAsync('EDIT_PERMISSION')
    await Roles.createRoleAsync('DELETE_PERMISSION')
    await Roles.addRolesToParentAsync('ALL_PERMISSIONS', 'user')
    await Roles.addRolesToParentAsync('EDIT_PERMISSION', 'ALL_PERMISSIONS')
    await Roles.addRolesToParentAsync('VIEW_PERMISSION', 'ALL_PERMISSIONS')
    await Roles.addRolesToParentAsync('DELETE_PERMISSION', 'admin')

    await Roles.addUsersToRolesAsync(users.eve, ['user'])
    await Roles.addUsersToRolesAsync(users.eve, ['ALL_PERMISSIONS'], 'scope')

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'MODERATE_PERMISSION'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'MODERATE_PERMISSION', 'scope'))

    const usersRoles = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'user' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'user' },
        { _id: 'ALL_PERMISSIONS' },
        { _id: 'EDIT_PERMISSION' },
        { _id: 'VIEW_PERMISSION' }
      ]
    }, {
      role: { _id: 'ALL_PERMISSIONS' },
      scope: 'scope',
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'ALL_PERMISSIONS' },
        { _id: 'EDIT_PERMISSION' },
        { _id: 'VIEW_PERMISSION' }
      ]
    }])

    await Roles.createRoleAsync('MODERATE_PERMISSION')

    await Roles.addRolesToParentAsync('MODERATE_PERMISSION', 'ALL_PERMISSIONS')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'MODERATE_PERMISSION'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'MODERATE_PERMISSION', 'scope'))

    const usersRoles2 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles2.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'user' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'user' },
        { _id: 'ALL_PERMISSIONS' },
        { _id: 'EDIT_PERMISSION' },
        { _id: 'VIEW_PERMISSION' },
        { _id: 'MODERATE_PERMISSION' }
      ]
    }, {
      role: { _id: 'ALL_PERMISSIONS' },
      scope: 'scope',
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'ALL_PERMISSIONS' },
        { _id: 'EDIT_PERMISSION' },
        { _id: 'VIEW_PERMISSION' },
        { _id: 'MODERATE_PERMISSION' }
      ]
    }])

    await Roles.addUsersToRolesAsync(users.eve, ['admin'])

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION', 'scope'))

    const usersRoles3 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles3.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'user' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'user' },
        { _id: 'ALL_PERMISSIONS' },
        { _id: 'EDIT_PERMISSION' },
        { _id: 'VIEW_PERMISSION' },
        { _id: 'MODERATE_PERMISSION' }
      ]
    }, {
      role: { _id: 'ALL_PERMISSIONS' },
      scope: 'scope',
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'ALL_PERMISSIONS' },
        { _id: 'EDIT_PERMISSION' },
        { _id: 'VIEW_PERMISSION' },
        { _id: 'MODERATE_PERMISSION' }
      ]
    }, {
      role: { _id: 'admin' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'admin' },
        { _id: 'DELETE_PERMISSION' }
      ]
    }])

    await Roles.addRolesToParentAsync('DELETE_PERMISSION', 'ALL_PERMISSIONS')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION', 'scope'))

    const usersRoles4 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles4.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'user' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'user' },
        { _id: 'ALL_PERMISSIONS' },
        { _id: 'EDIT_PERMISSION' },
        { _id: 'VIEW_PERMISSION' },
        { _id: 'MODERATE_PERMISSION' },
        { _id: 'DELETE_PERMISSION' }
      ]
    }, {
      role: { _id: 'ALL_PERMISSIONS' },
      scope: 'scope',
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'ALL_PERMISSIONS' },
        { _id: 'EDIT_PERMISSION' },
        { _id: 'VIEW_PERMISSION' },
        { _id: 'MODERATE_PERMISSION' },
        { _id: 'DELETE_PERMISSION' }
      ]
    }, {
      role: { _id: 'admin' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'admin' },
        { _id: 'DELETE_PERMISSION' }
      ]
    }])

    await Roles.removeUsersFromRolesAsync(users.eve, ['admin'])

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION', 'scope'))

    const usersRoles5 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles5.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'user' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'user' },
        { _id: 'ALL_PERMISSIONS' },
        { _id: 'EDIT_PERMISSION' },
        { _id: 'VIEW_PERMISSION' },
        { _id: 'MODERATE_PERMISSION' },
        { _id: 'DELETE_PERMISSION' }
      ]
    }, {
      role: { _id: 'ALL_PERMISSIONS' },
      scope: 'scope',
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'ALL_PERMISSIONS' },
        { _id: 'EDIT_PERMISSION' },
        { _id: 'VIEW_PERMISSION' },
        { _id: 'MODERATE_PERMISSION' },
        { _id: 'DELETE_PERMISSION' }
      ]
    }])

    await await Roles.deleteRoleAsync('ALL_PERMISSIONS')

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'DELETE_PERMISSION', 'scope'))

    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'MODERATE_PERMISSION'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'MODERATE_PERMISSION', 'scope'))

    const usersRoles6 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles6.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'user' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'user' }
      ]
    }])
  })

  it('delete role with overlapping hierarchical roles', async function () {
    await Roles.createRoleAsync('role1')
    await Roles.createRoleAsync('role2')
    await Roles.createRoleAsync('COMMON_PERMISSION_1')
    await Roles.createRoleAsync('COMMON_PERMISSION_2')
    await Roles.createRoleAsync('COMMON_PERMISSION_3')
    await Roles.createRoleAsync('EXTRA_PERMISSION_ROLE_1')
    await Roles.createRoleAsync('EXTRA_PERMISSION_ROLE_2')

    await Roles.addRolesToParentAsync('COMMON_PERMISSION_1', 'role1')
    await Roles.addRolesToParentAsync('COMMON_PERMISSION_2', 'role1')
    await Roles.addRolesToParentAsync('COMMON_PERMISSION_3', 'role1')
    await Roles.addRolesToParentAsync('EXTRA_PERMISSION_ROLE_1', 'role1')

    await Roles.addRolesToParentAsync('COMMON_PERMISSION_1', 'role2')
    await Roles.addRolesToParentAsync('COMMON_PERMISSION_2', 'role2')
    await Roles.addRolesToParentAsync('COMMON_PERMISSION_3', 'role2')
    await Roles.addRolesToParentAsync('EXTRA_PERMISSION_ROLE_2', 'role2')

    await Roles.addUsersToRolesAsync(users.eve, 'role1')
    await Roles.addUsersToRolesAsync(users.eve, 'role2')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'COMMON_PERMISSION_1'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_1'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_2'))

    const usersRoles = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'role1' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'role1' },
        { _id: 'COMMON_PERMISSION_1' },
        { _id: 'COMMON_PERMISSION_2' },
        { _id: 'COMMON_PERMISSION_3' },
        { _id: 'EXTRA_PERMISSION_ROLE_1' }
      ]
    }, {
      role: { _id: 'role2' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'role2' },
        { _id: 'COMMON_PERMISSION_1' },
        { _id: 'COMMON_PERMISSION_2' },
        { _id: 'COMMON_PERMISSION_3' },
        { _id: 'EXTRA_PERMISSION_ROLE_2' }
      ]
    }])

    await Roles.removeUsersFromRolesAsync(users.eve, 'role2')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'COMMON_PERMISSION_1'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_1'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_2'))

    const usersRoles2 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles2.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'role1' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'role1' },
        { _id: 'COMMON_PERMISSION_1' },
        { _id: 'COMMON_PERMISSION_2' },
        { _id: 'COMMON_PERMISSION_3' },
        { _id: 'EXTRA_PERMISSION_ROLE_1' }
      ]
    }])

    await Roles.addUsersToRolesAsync(users.eve, 'role2')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'COMMON_PERMISSION_1'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_1'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_2'))

    const usersRoles3 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles3.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'role1' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'role1' },
        { _id: 'COMMON_PERMISSION_1' },
        { _id: 'COMMON_PERMISSION_2' },
        { _id: 'COMMON_PERMISSION_3' },
        { _id: 'EXTRA_PERMISSION_ROLE_1' }
      ]
    }, {
      role: { _id: 'role2' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'role2' },
        { _id: 'COMMON_PERMISSION_1' },
        { _id: 'COMMON_PERMISSION_2' },
        { _id: 'COMMON_PERMISSION_3' },
        { _id: 'EXTRA_PERMISSION_ROLE_2' }
      ]
    }])

    await Roles.deleteRoleAsync('role2')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'COMMON_PERMISSION_1'))
    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_1'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'EXTRA_PERMISSION_ROLE_2'))

    const usersRoles4 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles4.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'role1' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'role1' },
        { _id: 'COMMON_PERMISSION_1' },
        { _id: 'COMMON_PERMISSION_2' },
        { _id: 'COMMON_PERMISSION_3' },
        { _id: 'EXTRA_PERMISSION_ROLE_1' }
      ]
    }])
  })

  it('set parent on assigned role', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('EDIT_PERMISSION')

    await Roles.addUsersToRolesAsync(users.eve, 'EDIT_PERMISSION')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'EDIT_PERMISSION'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'admin'))

    const usersRoles = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'EDIT_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
    }])

    await Roles.addRolesToParentAsync('EDIT_PERMISSION', 'admin')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'EDIT_PERMISSION'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'admin'))

    const usersRoles2 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles2.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'EDIT_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
    }])
  })

  it('remove parent on assigned role', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('EDIT_PERMISSION')

    await Roles.addRolesToParentAsync('EDIT_PERMISSION', 'admin')

    await Roles.addUsersToRolesAsync(users.eve, 'EDIT_PERMISSION')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'EDIT_PERMISSION'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'admin'))

    const usersRoles = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'EDIT_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
    }])

    await Roles.removeRolesFromParentAsync('EDIT_PERMISSION', 'admin')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'EDIT_PERMISSION'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'admin'))

    const usersRoles2 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles2.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'EDIT_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
    }])
  })

  it('adding and removing extra role parents', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('user')
    await Roles.createRoleAsync('EDIT_PERMISSION')

    await Roles.addRolesToParentAsync('EDIT_PERMISSION', 'admin')

    await Roles.addUsersToRolesAsync(users.eve, 'EDIT_PERMISSION')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'EDIT_PERMISSION'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'admin'))

    const usersRoles = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'EDIT_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
    }])

    await Roles.addRolesToParentAsync('EDIT_PERMISSION', 'user')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'EDIT_PERMISSION'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'admin'))

    const usersRoles2 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles2.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'EDIT_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
    }])

    await Roles.removeRolesFromParentAsync('EDIT_PERMISSION', 'user')

    assert.isTrue(await Roles.userIsInRoleAsync(users.eve, 'EDIT_PERMISSION'))
    assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'admin'))

    const usersRoles3 = await Roles.getRolesForUserAsync(users.eve, { anyScope: true, fullObjects: true })
    assert.sameDeepMembers(usersRoles3.map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'EDIT_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
    }])
  })

  it('cyclic roles', async function () {
    await Roles.createRoleAsync('admin')
    await Roles.createRoleAsync('editor')
    await Roles.createRoleAsync('user')

    await Roles.addRolesToParentAsync('editor', 'admin')
    await Roles.addRolesToParentAsync('user', 'editor')

    await assert.isRejected(Roles.addRolesToParentAsync('admin', 'user'), /form a cycle/)
  })

  describe('userIsInRole', function () {
    it('userIsInRole returns false for unknown roles', async function () {
      await Roles.createRoleAsync('admin')
      await Roles.createRoleAsync('user')
      await Roles.createRoleAsync('editor')
      await Roles.addUsersToRolesAsync(users.eve, ['admin', 'user'])
      await Roles.addUsersToRolesAsync(users.eve, ['editor'])

      assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'unknown'))
      assert.isFalse(await Roles.userIsInRoleAsync(users.eve, []))
      assert.isFalse(await Roles.userIsInRoleAsync(users.eve, null))
      assert.isFalse(await Roles.userIsInRoleAsync(users.eve, undefined))

      assert.isFalse(await Roles.userIsInRoleAsync(users.eve, 'unknown', { anyScope: true }))
      assert.isFalse(await Roles.userIsInRoleAsync(users.eve, [], { anyScope: true }))
      assert.isFalse(await Roles.userIsInRoleAsync(users.eve, null, { anyScope: true }))
      assert.isFalse(await Roles.userIsInRoleAsync(users.eve, undefined, { anyScope: true }))

      assert.isFalse(await Roles.userIsInRoleAsync(users.eve, ['Role1', 'Role2', undefined], 'GroupName'))
    })

    it('userIsInRole returns false if user is a function', async function () {
      await Roles.createRoleAsync('admin')
      await Roles.addUsersToRolesAsync(users.eve, ['admin'])

      assert.isFalse(await Roles.userIsInRoleAsync(() => {}, 'admin'))
    })
  })

  describe('isParentOf', function () {
    it('returns false for unknown roles', async function () {
      await Roles.createRoleAsync('admin')

      assert.isFalse(await Roles.isParentOfAsync('admin', 'unknown'))
      assert.isFalse(await Roles.isParentOfAsync('admin', null))
      assert.isFalse(await Roles.isParentOfAsync('admin', undefined))

      assert.isFalse(await Roles.isParentOfAsync('unknown', 'admin'))
      assert.isFalse(await Roles.isParentOfAsync(null, 'admin'))
      assert.isFalse(await Roles.isParentOfAsync(undefined, 'admin'))
    })

    it('returns false if role is not parent of', async function () {
      await Roles.createRoleAsync('admin')
      await Roles.createRoleAsync('editor')
      await Roles.createRoleAsync('user')
      await Roles.addRolesToParentAsync(['editor'], 'admin')
      await Roles.addRolesToParentAsync(['user'], 'editor')

      assert.isFalse(await Roles.isParentOfAsync('user', 'admin'))
      assert.isFalse(await Roles.isParentOfAsync('editor', 'admin'))
    })

    it('returns true if role is parent of the demanded role', async function () {
      await Roles.createRoleAsync('admin')
      await Roles.createRoleAsync('editor')
      await Roles.createRoleAsync('user')
      await Roles.addRolesToParentAsync(['editor'], 'admin')
      await Roles.addRolesToParentAsync(['user'], 'editor')

      assert.isTrue(await Roles.isParentOfAsync('admin', 'user'))
      assert.isTrue(await Roles.isParentOfAsync('editor', 'user'))
      assert.isTrue(await Roles.isParentOfAsync('admin', 'editor'))

      assert.isTrue(await Roles.isParentOfAsync('admin', 'admin'))
      assert.isTrue(await Roles.isParentOfAsync('editor', 'editor'))
      assert.isTrue(await Roles.isParentOfAsync('user', 'user'))
    })
  })
})
