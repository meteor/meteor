/* eslint-env mocha */
/* global Roles */

import { Meteor } from 'meteor/meteor'
import { assert } from 'chai'

// To ensure that the files are loaded for coverage
import '../roles_server'
import '../roles_common'

// To allow inserting on the client, needed for testing.
Meteor.roleAssignment.allow({
  insert () { return true },
  update () { return true },
  remove () { return true }
})

const hasProp = (target, prop) => Object.hasOwnProperty.call(target, prop)

describe('roles', function () {
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

  function addUser (name) {
    return Meteor.users.insert({ username: name })
  }

  function testUser (username, expectedRoles, scope) {
    const userId = users[username]
    const userObj = Meteor.users.findOne({ _id: userId })

    // check using user ids (makes db calls)
    _innerTest(userId, username, expectedRoles, scope)

    // check using passed-in user object
    _innerTest(userObj, username, expectedRoles, scope)
  }

  function _innerTest (userParam, username, expectedRoles, scope) {
    // test that user has only the roles expected and no others
    roles.forEach(function (role) {
      const expected = expectedRoles.includes(role)
      const msg = username + ' expected to have \'' + role + '\' role but does not'
      const nmsg = username + ' had the following un-expected role: ' + role

      if (expected) {
        assert.isTrue(Roles.userIsInRole(userParam, role, scope), msg)
      } else {
        assert.isFalse(Roles.userIsInRole(userParam, role, scope), nmsg)
      }
    })
  }

  beforeEach(function () {
    Meteor.roles.remove({})
    Meteor.roleAssignment.remove({})
    Meteor.users.remove({})

    users = {
      eve: addUser('eve'),
      bob: addUser('bob'),
      joe: addUser('joe')
    }
  })

  it('can create and delete roles', function () {
    const role1Id = Roles.createRole('test1')
    assert.equal(Meteor.roles.findOne()._id, 'test1')
    assert.equal(Meteor.roles.findOne(role1Id)._id, 'test1')

    const role2Id = Roles.createRole('test2')
    assert.equal(Meteor.roles.findOne({ _id: 'test2' })._id, 'test2')
    assert.equal(Meteor.roles.findOne(role2Id)._id, 'test2')

    assert.equal(Meteor.roles.find().count(), 2)

    Roles.deleteRole('test1')
    assert.equal(typeof Meteor.roles.findOne({ _id: 'test1' }), 'undefined')

    Roles.deleteRole('test2')
    assert.equal(typeof Meteor.roles.findOne(), 'undefined')
  })

  it('can try to remove non-existing roles without crashing', function () {
    Roles.deleteRole('non-existing-role')
  })

  it('can\'t create duplicate roles', function () {
    Roles.createRole('test1')
    assert.throws(function () { Roles.createRole('test1') })
    assert.isNull(Roles.createRole('test1', { unlessExists: true }))
  })

  it('can\'t create role with empty names', function () {
    assert.throws(function () {
      Roles.createRole('')
    }, /Invalid role name/)
    assert.throws(function () {
      Roles.createRole(null)
    }, /Invalid role name/)
    assert.throws(function () {
      Roles.createRole(' ')
    }, /Invalid role name/)
    assert.throws(function () {
      Roles.createRole(' foobar')
    }, /Invalid role name/)
    assert.throws(function () {
      Roles.createRole(' foobar ')
    }, /Invalid role name/)
  })

  it('can\'t use invalid scope names', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')
    Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'scope1')
    Roles.addUsersToRoles(users.eve, ['editor'], 'scope2')

    assert.throws(function () {
      Roles.addUsersToRoles(users.eve, ['admin', 'user'], '')
    }, /Invalid scope name/)
    assert.throws(function () {
      Roles.addUsersToRoles(users.eve, ['admin', 'user'], ' ')
    }, /Invalid scope name/)
    assert.throws(function () {
      Roles.addUsersToRoles(users.eve, ['admin', 'user'], ' foobar')
    }, /Invalid scope name/)
    assert.throws(function () {
      Roles.addUsersToRoles(users.eve, ['admin', 'user'], ' foobar ')
    }, /Invalid scope name/)
    assert.throws(function () {
      Roles.addUsersToRoles(users.eve, ['admin', 'user'], 42)
    }, /Invalid scope name/)
  })

  it('can check if user is in role', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.addUsersToRoles(users.eve, ['admin', 'user'])

    testUser('eve', ['admin', 'user'])
  })

  it('can check if user is in role by scope', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')
    Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'scope1')
    Roles.addUsersToRoles(users.eve, ['editor'], 'scope2')

    testUser('eve', ['admin', 'user'], 'scope1')
    testUser('eve', ['editor'], 'scope2')

    assert.isFalse(Roles.userIsInRole(users.eve, ['admin', 'user'], 'scope2'))
    assert.isFalse(Roles.userIsInRole(users.eve, ['editor'], 'scope1'))

    assert.isTrue(Roles.userIsInRole(users.eve, ['admin', 'user'], { anyScope: true }))
    assert.isTrue(Roles.userIsInRole(users.eve, ['editor'], { anyScope: true }))
  })

  it('can check if user is in role by scope through options', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')
    Roles.addUsersToRoles(users.eve, ['admin', 'user'], { scope: 'scope1' })
    Roles.addUsersToRoles(users.eve, ['editor'], { scope: 'scope2' })

    testUser('eve', ['admin', 'user'], { scope: 'scope1' })
    testUser('eve', ['editor'], { scope: 'scope2' })
  })

  it('can check if user is in role by scope with global role', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')
    Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'scope1')
    Roles.addUsersToRoles(users.eve, ['editor'], 'scope2')
    Roles.addUsersToRoles(users.eve, ['admin'])

    assert.isTrue(Roles.userIsInRole(users.eve, ['user'], 'scope1'))
    assert.isTrue(Roles.userIsInRole(users.eve, ['editor'], 'scope2'))

    assert.isFalse(Roles.userIsInRole(users.eve, ['user']))
    assert.isFalse(Roles.userIsInRole(users.eve, ['editor']))
    assert.isFalse(Roles.userIsInRole(users.eve, ['user'], null))
    assert.isFalse(Roles.userIsInRole(users.eve, ['editor'], null))

    assert.isFalse(Roles.userIsInRole(users.eve, ['user'], 'scope2'))
    assert.isFalse(Roles.userIsInRole(users.eve, ['editor'], 'scope1'))

    assert.isTrue(Roles.userIsInRole(users.eve, ['admin'], 'scope2'))
    assert.isTrue(Roles.userIsInRole(users.eve, ['admin'], 'scope1'))
    assert.isTrue(Roles.userIsInRole(users.eve, ['admin']))
    assert.isTrue(Roles.userIsInRole(users.eve, ['admin'], null))
  })

  it('renaming scopes', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')
    Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'scope1')
    Roles.addUsersToRoles(users.eve, ['editor'], 'scope2')

    testUser('eve', ['admin', 'user'], 'scope1')
    testUser('eve', ['editor'], 'scope2')

    Roles.renameScope('scope1', 'scope3')

    testUser('eve', ['admin', 'user'], 'scope3')
    testUser('eve', ['editor'], 'scope2')

    assert.isFalse(Roles.userIsInRole(users.eve, ['admin', 'user'], 'scope1'))
    assert.isFalse(Roles.userIsInRole(users.eve, ['admin', 'user'], 'scope2'))

    assert.throws(function () {
      Roles.renameScope('scope3')
    }, /Invalid scope name/)

    Roles.renameScope('scope3', null)

    testUser('eve', ['admin', 'user', 'editor'], 'scope2')

    assert.isFalse(Roles.userIsInRole(users.eve, ['editor']))
    assert.isTrue(Roles.userIsInRole(users.eve, ['admin']))
    assert.isTrue(Roles.userIsInRole(users.eve, ['user']))
    assert.isFalse(Roles.userIsInRole(users.eve, ['editor'], null))
    assert.isTrue(Roles.userIsInRole(users.eve, ['admin'], null))
    assert.isTrue(Roles.userIsInRole(users.eve, ['user'], null))

    Roles.renameScope(null, 'scope2')

    testUser('eve', ['admin', 'user', 'editor'], 'scope2')

    assert.isFalse(Roles.userIsInRole(users.eve, ['editor']))
    assert.isFalse(Roles.userIsInRole(users.eve, ['admin']))
    assert.isFalse(Roles.userIsInRole(users.eve, ['user']))
    assert.isFalse(Roles.userIsInRole(users.eve, ['editor'], null))
    assert.isFalse(Roles.userIsInRole(users.eve, ['admin'], null))
    assert.isFalse(Roles.userIsInRole(users.eve, ['user'], null))
  })

  it('removing scopes', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')
    Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'scope1')
    Roles.addUsersToRoles(users.eve, ['editor'], 'scope2')

    testUser('eve', ['admin', 'user'], 'scope1')
    testUser('eve', ['editor'], 'scope2')

    Roles.removeScope('scope1')

    testUser('eve', ['editor'], 'scope2')

    assert.isFalse(Roles.userIsInRole(users.eve, ['admin', 'user'], 'scope1'))
    assert.isFalse(Roles.userIsInRole(users.eve, ['admin', 'user'], 'scope2'))
  })

  it('can check if non-existant user is in role', function () {
    assert.isFalse(Roles.userIsInRole('1', 'admin'))
  })

  it('can check if null user is in role', function () {
    assert.isFalse(Roles.userIsInRole(null, 'admin'))
  })

  it('can check user against several roles at once', function () {
    Roles.createRole('admin')
    Roles.createRole('user')

    Roles.addUsersToRoles(users.eve, ['admin', 'user'])
    const user = Meteor.users.findOne({ _id: users.eve })

    // we can check the non-existing role
    assert.isTrue(Roles.userIsInRole(user, ['editor', 'admin']))
  })

  it('can\'t add non-existent user to role', function () {
    Roles.createRole('admin')

    Roles.addUsersToRoles(['1'], ['admin'])
    assert.equal(Meteor.users.findOne({ _id: '1' }), undefined)
  })

  it('can\'t add user to non-existent role', function () {
    assert.throws(function () {
      Roles.addUsersToRoles(users.eve, ['admin'])
    }, /Role 'admin' does not exist/)
    Roles.addUsersToRoles(users.eve, ['admin'], { ifExists: true })
  })

  it('can\'t set non-existent user to role', function () {
    Roles.createRole('admin')

    Roles.setUserRoles(['1'], ['admin'])
    assert.equal(Meteor.users.findOne({ _id: '1' }), undefined)
  })

  it('can\'t set user to non-existent role', function () {
    assert.throws(function () {
      Roles.setUserRoles(users.eve, ['admin'])
    }, /Role 'admin' does not exist/)
    Roles.setUserRoles(users.eve, ['admin'], { ifExists: true })
  })

  it('can add individual users to roles', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    Roles.addUsersToRoles(users.eve, ['admin', 'user'])

    testUser('eve', ['admin', 'user'])
    testUser('bob', [])
    testUser('joe', [])

    Roles.addUsersToRoles(users.joe, ['editor', 'user'])

    testUser('eve', ['admin', 'user'])
    testUser('bob', [])
    testUser('joe', ['editor', 'user'])
  })

  it('can add individual users to roles by scope', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'scope1')

    testUser('eve', ['admin', 'user'], 'scope1')
    testUser('bob', [], 'scope1')
    testUser('joe', [], 'scope1')

    testUser('eve', [], 'scope2')
    testUser('bob', [], 'scope2')
    testUser('joe', [], 'scope2')

    Roles.addUsersToRoles(users.joe, ['editor', 'user'], 'scope1')
    Roles.addUsersToRoles(users.bob, ['editor', 'user'], 'scope2')

    testUser('eve', ['admin', 'user'], 'scope1')
    testUser('bob', [], 'scope1')
    testUser('joe', ['editor', 'user'], 'scope1')

    testUser('eve', [], 'scope2')
    testUser('bob', ['editor', 'user'], 'scope2')
    testUser('joe', [], 'scope2')
  })

  it('can add user to roles via user object', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    const eve = Meteor.users.findOne({ _id: users.eve })
    const bob = Meteor.users.findOne({ _id: users.bob })

    Roles.addUsersToRoles(eve, ['admin', 'user'])

    testUser('eve', ['admin', 'user'])
    testUser('bob', [])
    testUser('joe', [])

    Roles.addUsersToRoles(bob, ['editor'])

    testUser('eve', ['admin', 'user'])
    testUser('bob', ['editor'])
    testUser('joe', [])
  })

  it('can add user to roles multiple times', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    Roles.addUsersToRoles(users.eve, ['admin', 'user'])
    Roles.addUsersToRoles(users.eve, ['admin', 'user'])

    testUser('eve', ['admin', 'user'])
    testUser('bob', [])
    testUser('joe', [])

    Roles.addUsersToRoles(users.bob, ['admin'])
    Roles.addUsersToRoles(users.bob, ['editor'])

    testUser('eve', ['admin', 'user'])
    testUser('bob', ['admin', 'editor'])
    testUser('joe', [])
  })

  it('can add user to roles multiple times by scope', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'scope1')
    Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'scope1')

    testUser('eve', ['admin', 'user'], 'scope1')
    testUser('bob', [], 'scope1')
    testUser('joe', [], 'scope1')

    Roles.addUsersToRoles(users.bob, ['admin'], 'scope1')
    Roles.addUsersToRoles(users.bob, ['editor'], 'scope1')

    testUser('eve', ['admin', 'user'], 'scope1')
    testUser('bob', ['admin', 'editor'], 'scope1')
    testUser('joe', [], 'scope1')
  })

  it('can add multiple users to roles', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    Roles.addUsersToRoles([users.eve, users.bob], ['admin', 'user'])

    testUser('eve', ['admin', 'user'])
    testUser('bob', ['admin', 'user'])
    testUser('joe', [])

    Roles.addUsersToRoles([users.bob, users.joe], ['editor', 'user'])

    testUser('eve', ['admin', 'user'])
    testUser('bob', ['admin', 'editor', 'user'])
    testUser('joe', ['editor', 'user'])
  })

  it('can add multiple users to roles by scope', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    Roles.addUsersToRoles([users.eve, users.bob], ['admin', 'user'], 'scope1')

    testUser('eve', ['admin', 'user'], 'scope1')
    testUser('bob', ['admin', 'user'], 'scope1')
    testUser('joe', [], 'scope1')

    testUser('eve', [], 'scope2')
    testUser('bob', [], 'scope2')
    testUser('joe', [], 'scope2')

    Roles.addUsersToRoles([users.bob, users.joe], ['editor', 'user'], 'scope1')
    Roles.addUsersToRoles([users.bob, users.joe], ['editor', 'user'], 'scope2')

    testUser('eve', ['admin', 'user'], 'scope1')
    testUser('bob', ['admin', 'editor', 'user'], 'scope1')
    testUser('joe', ['editor', 'user'], 'scope1')

    testUser('eve', [], 'scope2')
    testUser('bob', ['editor', 'user'], 'scope2')
    testUser('joe', ['editor', 'user'], 'scope2')
  })

  it('can remove individual users from roles', function () {
    Roles.createRole('user')
    Roles.createRole('editor')

    // remove user role - one user
    Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'])
    testUser('eve', ['editor', 'user'])
    testUser('bob', ['editor', 'user'])
    Roles.removeUsersFromRoles(users.eve, ['user'])
    testUser('eve', ['editor'])
    testUser('bob', ['editor', 'user'])
  })

  it('can remove user from roles multiple times', function () {
    Roles.createRole('user')
    Roles.createRole('editor')

    // remove user role - one user
    Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'])
    testUser('eve', ['editor', 'user'])
    testUser('bob', ['editor', 'user'])
    Roles.removeUsersFromRoles(users.eve, ['user'])
    testUser('eve', ['editor'])
    testUser('bob', ['editor', 'user'])

    // try remove again
    Roles.removeUsersFromRoles(users.eve, ['user'])
    testUser('eve', ['editor'])
  })

  it('can remove users from roles via user object', function () {
    Roles.createRole('user')
    Roles.createRole('editor')

    const eve = Meteor.users.findOne({ _id: users.eve })
    const bob = Meteor.users.findOne({ _id: users.bob })

    // remove user role - one user
    Roles.addUsersToRoles([eve, bob], ['editor', 'user'])
    testUser('eve', ['editor', 'user'])
    testUser('bob', ['editor', 'user'])
    Roles.removeUsersFromRoles(eve, ['user'])
    testUser('eve', ['editor'])
    testUser('bob', ['editor', 'user'])
  })

  it('can remove individual users from roles by scope', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    // remove user role - one user
    Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'], 'scope1')
    Roles.addUsersToRoles([users.joe, users.bob], ['admin'], 'scope2')
    testUser('eve', ['editor', 'user'], 'scope1')
    testUser('bob', ['editor', 'user'], 'scope1')
    testUser('joe', [], 'scope1')
    testUser('eve', [], 'scope2')
    testUser('bob', ['admin'], 'scope2')
    testUser('joe', ['admin'], 'scope2')

    Roles.removeUsersFromRoles(users.eve, ['user'], 'scope1')
    testUser('eve', ['editor'], 'scope1')
    testUser('bob', ['editor', 'user'], 'scope1')
    testUser('joe', [], 'scope1')
    testUser('eve', [], 'scope2')
    testUser('bob', ['admin'], 'scope2')
    testUser('joe', ['admin'], 'scope2')
  })

  it('can remove individual users from roles by scope through options', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    // remove user role - one user
    Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'], { scope: 'scope1' })
    Roles.addUsersToRoles([users.joe, users.bob], ['admin'], { scope: 'scope2' })
    testUser('eve', ['editor', 'user'], 'scope1')
    testUser('bob', ['editor', 'user'], 'scope1')
    testUser('joe', [], 'scope1')
    testUser('eve', [], 'scope2')
    testUser('bob', ['admin'], 'scope2')
    testUser('joe', ['admin'], 'scope2')

    Roles.removeUsersFromRoles(users.eve, ['user'], { scope: 'scope1' })
    testUser('eve', ['editor'], 'scope1')
    testUser('bob', ['editor', 'user'], 'scope1')
    testUser('joe', [], 'scope1')
    testUser('eve', [], 'scope2')
    testUser('bob', ['admin'], 'scope2')
    testUser('joe', ['admin'], 'scope2')
  })

  it('can remove multiple users from roles', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    // remove user role - two users
    Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'])
    testUser('eve', ['editor', 'user'])
    testUser('bob', ['editor', 'user'])

    assert.isFalse(Roles.userIsInRole(users.joe, 'admin'))
    Roles.addUsersToRoles([users.bob, users.joe], ['admin', 'user'])
    testUser('bob', ['admin', 'user', 'editor'])
    testUser('joe', ['admin', 'user'])
    Roles.removeUsersFromRoles([users.bob, users.joe], ['admin'])
    testUser('bob', ['user', 'editor'])
    testUser('joe', ['user'])
  })

  it('can remove multiple users from roles by scope', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    // remove user role - one user
    Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'], 'scope1')
    Roles.addUsersToRoles([users.joe, users.bob], ['admin'], 'scope2')
    testUser('eve', ['editor', 'user'], 'scope1')
    testUser('bob', ['editor', 'user'], 'scope1')
    testUser('joe', [], 'scope1')
    testUser('eve', [], 'scope2')
    testUser('bob', ['admin'], 'scope2')
    testUser('joe', ['admin'], 'scope2')

    Roles.removeUsersFromRoles([users.eve, users.bob], ['user'], 'scope1')
    testUser('eve', ['editor'], 'scope1')
    testUser('bob', ['editor'], 'scope1')
    testUser('joe', [], 'scope1')
    testUser('eve', [], 'scope2')
    testUser('bob', ['admin'], 'scope2')
    testUser('joe', ['admin'], 'scope2')

    Roles.removeUsersFromRoles([users.joe, users.bob], ['admin'], 'scope2')
    testUser('eve', [], 'scope2')
    testUser('bob', [], 'scope2')
    testUser('joe', [], 'scope2')
  })

  it('can remove multiple users from roles of any scope', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    // remove user role - one user
    Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'], 'scope1')
    Roles.addUsersToRoles([users.joe, users.bob], ['user'], 'scope2')
    testUser('eve', ['editor', 'user'], 'scope1')
    testUser('bob', ['editor', 'user'], 'scope1')
    testUser('joe', [], 'scope1')
    testUser('eve', [], 'scope2')
    testUser('bob', ['user'], 'scope2')
    testUser('joe', ['user'], 'scope2')

    Roles.removeUsersFromRoles([users.eve, users.bob], ['user'], { anyScope: true })
    testUser('eve', ['editor'], 'scope1')
    testUser('bob', ['editor'], 'scope1')
    testUser('joe', [], 'scope1')
    testUser('eve', [], 'scope2')
    testUser('bob', [], 'scope2')
    testUser('joe', ['user'], 'scope2')
  })

  it('can set user roles', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    const eve = Meteor.users.findOne({ _id: users.eve })
    const bob = Meteor.users.findOne({ _id: users.bob })

    Roles.setUserRoles([users.eve, bob], ['editor', 'user'])
    testUser('eve', ['editor', 'user'])
    testUser('bob', ['editor', 'user'])
    testUser('joe', [])

    // use addUsersToRoles add some roles
    Roles.addUsersToRoles([bob, users.joe], ['admin'])
    testUser('eve', ['editor', 'user'])
    testUser('bob', ['admin', 'editor', 'user'])
    testUser('joe', ['admin'])

    Roles.setUserRoles([eve, bob], ['user'])
    testUser('eve', ['user'])
    testUser('bob', ['user'])
    testUser('joe', ['admin'])

    Roles.setUserRoles(bob, 'editor')
    testUser('eve', ['user'])
    testUser('bob', ['editor'])
    testUser('joe', ['admin'])

    Roles.setUserRoles([users.joe, users.bob], [])
    testUser('eve', ['user'])
    testUser('bob', [])
    testUser('joe', [])
  })

  it('can set user roles by scope', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    const eve = Meteor.users.findOne({ _id: users.eve })
    const bob = Meteor.users.findOne({ _id: users.bob })
    const joe = Meteor.users.findOne({ _id: users.joe })

    Roles.setUserRoles([users.eve, users.bob], ['editor', 'user'], 'scope1')
    Roles.setUserRoles([users.bob, users.joe], ['admin'], 'scope2')
    testUser('eve', ['editor', 'user'], 'scope1')
    testUser('bob', ['editor', 'user'], 'scope1')
    testUser('joe', [], 'scope1')
    testUser('eve', [], 'scope2')
    testUser('bob', ['admin'], 'scope2')
    testUser('joe', ['admin'], 'scope2')

    // use addUsersToRoles add some roles
    Roles.addUsersToRoles([users.eve, users.bob], ['admin'], 'scope1')
    Roles.addUsersToRoles([users.bob, users.joe], ['editor'], 'scope2')
    testUser('eve', ['admin', 'editor', 'user'], 'scope1')
    testUser('bob', ['admin', 'editor', 'user'], 'scope1')
    testUser('joe', [], 'scope1')
    testUser('eve', [], 'scope2')
    testUser('bob', ['admin', 'editor'], 'scope2')
    testUser('joe', ['admin', 'editor'], 'scope2')

    Roles.setUserRoles([eve, bob], ['user'], 'scope1')
    Roles.setUserRoles([eve, joe], ['editor'], 'scope2')
    testUser('eve', ['user'], 'scope1')
    testUser('bob', ['user'], 'scope1')
    testUser('joe', [], 'scope1')
    testUser('eve', ['editor'], 'scope2')
    testUser('bob', ['admin', 'editor'], 'scope2')
    testUser('joe', ['editor'], 'scope2')

    Roles.setUserRoles(bob, 'editor', 'scope1')
    testUser('eve', ['user'], 'scope1')
    testUser('bob', ['editor'], 'scope1')
    testUser('joe', [], 'scope1')
    testUser('eve', ['editor'], 'scope2')
    testUser('bob', ['admin', 'editor'], 'scope2')
    testUser('joe', ['editor'], 'scope2')

    assert.isTrue(Roles.getRolesForUser(users.bob, { anyScope: true, fullObjects: true }).map(r => r.scope).includes('scope1'))
    assert.isFalse(Roles.getRolesForUser(users.joe, { anyScope: true, fullObjects: true }).map(r => r.scope).includes('scope1'))

    Roles.setUserRoles([bob, users.joe], [], 'scope1')
    testUser('eve', ['user'], 'scope1')
    testUser('bob', [], 'scope1')
    testUser('joe', [], 'scope1')
    testUser('eve', ['editor'], 'scope2')
    testUser('bob', ['admin', 'editor'], 'scope2')
    testUser('joe', ['editor'], 'scope2')

    // When roles in a given scope are removed, we do not want any dangling database content for that scope.
    assert.isFalse(Roles.getRolesForUser(users.bob, { anyScope: true, fullObjects: true }).map(r => r.scope).includes('scope1'))
    assert.isFalse(Roles.getRolesForUser(users.joe, { anyScope: true, fullObjects: true }).map(r => r.scope).includes('scope1'))
  })

  it('can set user roles by scope including GLOBAL_SCOPE', function () {
    Roles.createRole('admin')
    Roles.createRole('editor')

    const eve = Meteor.users.findOne({ _id: users.eve })

    Roles.addUsersToRoles(eve, 'admin', Roles.GLOBAL_SCOPE)
    testUser('eve', ['admin'], 'scope1')
    testUser('eve', ['admin'])

    Roles.setUserRoles(eve, 'editor', Roles.GLOBAL_SCOPE)
    testUser('eve', ['editor'], 'scope2')
    testUser('eve', ['editor'])
  })

  it('can set user roles by scope and anyScope', function () {
    Roles.createRole('admin')
    Roles.createRole('editor')

    const eve = Meteor.users.findOne({ _id: users.eve })

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [])

    Roles.addUsersToRoles(eve, 'admin')

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'admin' }]
    }])

    Roles.setUserRoles(eve, 'editor', { anyScope: true, scope: 'scope2' })

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'editor' },
      scope: 'scope2',
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'editor' }]
    }])
  })

  it('can get all roles', function () {
    roles.forEach(function (role) {
      Roles.createRole(role)
    })

    // compare roles, sorted alphabetically
    const expected = roles
    const actual = Roles.getAllRoles().fetch().map(r => r._id)

    assert.sameMembers(actual, expected)

    assert.sameMembers(Roles.getAllRoles({ sort: { _id: -1 } }).fetch().map(r => r._id), expected.reverse())
  })

  it('get an empty list of roles for an empty user', function () {
    assert.sameMembers(Roles.getRolesForUser(undefined), [])
    assert.sameMembers(Roles.getRolesForUser(null), [])
    assert.sameMembers(Roles.getRolesForUser({}), [])
  })

  it('get an empty list of roles for non-existant user', function () {
    assert.sameMembers(Roles.getRolesForUser('1'), [])
    assert.sameMembers(Roles.getRolesForUser('1', 'scope1'), [])
  })

  it('can get all roles for user', function () {
    Roles.createRole('admin')
    Roles.createRole('user')

    const userId = users.eve
    let userObj

    // by userId
    assert.sameMembers(Roles.getRolesForUser(userId), [])

    // by user object
    userObj = Meteor.users.findOne({ _id: userId })
    assert.sameMembers(Roles.getRolesForUser(userObj), [])

    Roles.addUsersToRoles(userId, ['admin', 'user'])

    // by userId
    assert.sameMembers(Roles.getRolesForUser(userId), ['admin', 'user'])

    // by user object
    userObj = Meteor.users.findOne({ _id: userId })
    assert.sameMembers(Roles.getRolesForUser(userObj), ['admin', 'user'])

    assert.sameDeepMembers(Roles.getRolesForUser(userId, { fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
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

  it('can get all roles for user by scope', function () {
    Roles.createRole('admin')
    Roles.createRole('user')

    const userId = users.eve
    let userObj

    // by userId
    assert.sameMembers(Roles.getRolesForUser(userId, 'scope1'), [])

    // by user object
    userObj = Meteor.users.findOne({ _id: userId })
    assert.sameMembers(Roles.getRolesForUser(userObj, 'scope1'), [])

    // add roles
    Roles.addUsersToRoles(userId, ['admin', 'user'], 'scope1')
    Roles.addUsersToRoles(userId, ['admin'], 'scope2')

    // by userId
    assert.sameMembers(Roles.getRolesForUser(userId, 'scope1'), ['admin', 'user'])
    assert.sameMembers(Roles.getRolesForUser(userId, 'scope2'), ['admin'])
    assert.sameMembers(Roles.getRolesForUser(userId), [])

    // by user object
    userObj = Meteor.users.findOne({ _id: userId })
    assert.sameMembers(Roles.getRolesForUser(userObj, 'scope1'), ['admin', 'user'])
    assert.sameMembers(Roles.getRolesForUser(userObj, 'scope2'), ['admin'])
    assert.sameMembers(Roles.getRolesForUser(userObj), [])

    assert.sameDeepMembers(Roles.getRolesForUser(userId, { fullObjects: true, scope: 'scope1' }).map(obj => { delete obj._id; return obj }), [{
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
    assert.sameDeepMembers(Roles.getRolesForUser(userId, { fullObjects: true, scope: 'scope2' }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: 'scope2',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }])

    assert.sameDeepMembers(Roles.getRolesForUser(userId, { fullObjects: true, anyScope: true }).map(obj => { delete obj._id; return obj }), [{
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

    Roles.createRole('PERMISSION')
    Roles.addRolesToParent('PERMISSION', 'user')

    assert.sameDeepMembers(Roles.getRolesForUser(userId, { fullObjects: true, scope: 'scope1' }).map(obj => { delete obj._id; return obj }), [{
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
    assert.sameDeepMembers(Roles.getRolesForUser(userId, { fullObjects: true, scope: 'scope2' }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: 'scope2',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }])
    assert.sameMembers(Roles.getRolesForUser(userId, { scope: 'scope1' }), ['admin', 'user', 'PERMISSION'])
    assert.sameMembers(Roles.getRolesForUser(userId, { scope: 'scope2' }), ['admin'])

    assert.sameDeepMembers(Roles.getRolesForUser(userId, { fullObjects: true, anyScope: true }).map(obj => { delete obj._id; return obj }), [{
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
    assert.sameMembers(Roles.getRolesForUser(userId, { anyScope: true }), ['admin', 'user', 'PERMISSION'])

    assert.sameDeepMembers(Roles.getRolesForUser(userId, { fullObjects: true, scope: 'scope1', onlyAssigned: true }).map(obj => { delete obj._id; return obj }), [{
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
    assert.sameDeepMembers(Roles.getRolesForUser(userId, { fullObjects: true, scope: 'scope2', onlyAssigned: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: 'scope2',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'admin' }]
    }])
    assert.sameMembers(Roles.getRolesForUser(userId, { scope: 'scope1', onlyAssigned: true }), ['admin', 'user'])
    assert.sameMembers(Roles.getRolesForUser(userId, { scope: 'scope2', onlyAssigned: true }), ['admin'])

    assert.sameDeepMembers(Roles.getRolesForUser(userId, { fullObjects: true, anyScope: true, onlyAssigned: true }).map(obj => { delete obj._id; return obj }), [{
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
    assert.sameMembers(Roles.getRolesForUser(userId, { anyScope: true, onlyAssigned: true }), ['admin', 'user'])
  })

  it('can get only scoped roles for user', function () {
    Roles.createRole('admin')
    Roles.createRole('user')

    const userId = users.eve

    // add roles
    Roles.addUsersToRoles(userId, ['user'], 'scope1')
    Roles.addUsersToRoles(userId, ['admin'])

    Roles.createRole('PERMISSION')
    Roles.addRolesToParent('PERMISSION', 'user')

    assert.sameMembers(Roles.getRolesForUser(userId, { onlyScoped: true, scope: 'scope1' }), ['user', 'PERMISSION'])
    assert.sameMembers(Roles.getRolesForUser(userId, { onlyScoped: true, onlyAssigned: true, scope: 'scope1' }), ['user'])
    assert.sameDeepMembers(Roles.getRolesForUser(userId, { onlyScoped: true, fullObjects: true, scope: 'scope1' }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'user' },
      scope: 'scope1',
      user: { _id: userId },
      inheritedRoles: [{ _id: 'user' }, { _id: 'PERMISSION' }]
    }])
  })

  it('can get all roles for user by scope with periods in name', function () {
    Roles.createRole('admin')

    Roles.addUsersToRoles(users.joe, ['admin'], 'example.k12.va.us')

    assert.sameMembers(Roles.getRolesForUser(users.joe, 'example.k12.va.us'), ['admin'])
  })

  it('can get all roles for user by scope including Roles.GLOBAL_SCOPE', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    const userId = users.eve

    Roles.addUsersToRoles([users.eve], ['editor'], Roles.GLOBAL_SCOPE)
    Roles.addUsersToRoles([users.eve], ['admin', 'user'], 'scope1')

    // by userId
    assert.sameMembers(Roles.getRolesForUser(userId, 'scope1'), ['editor', 'admin', 'user'])
    assert.sameMembers(Roles.getRolesForUser(userId), ['editor'])

    // by user object
    const userObj = Meteor.users.findOne({ _id: userId })
    assert.sameMembers(Roles.getRolesForUser(userObj, 'scope1'), ['editor', 'admin', 'user'])
    assert.sameMembers(Roles.getRolesForUser(userObj), ['editor'])
  })

  it('getRolesForUser should not return null entries if user has no roles for scope', function () {
    Roles.createRole('editor')

    const userId = users.eve
    let userObj

    // by userId
    assert.sameMembers(Roles.getRolesForUser(userId, 'scope1'), [])
    assert.sameMembers(Roles.getRolesForUser(userId), [])

    // by user object
    userObj = Meteor.users.findOne({ _id: userId })
    assert.sameMembers(Roles.getRolesForUser(userObj, 'scope1'), [])
    assert.sameMembers(Roles.getRolesForUser(userObj), [])

    Roles.addUsersToRoles([users.eve], ['editor'], Roles.GLOBAL_SCOPE)

    // by userId
    assert.sameMembers(Roles.getRolesForUser(userId, 'scope1'), ['editor'])
    assert.sameMembers(Roles.getRolesForUser(userId), ['editor'])

    // by user object
    userObj = Meteor.users.findOne({ _id: userId })
    assert.sameMembers(Roles.getRolesForUser(userObj, 'scope1'), ['editor'])
    assert.sameMembers(Roles.getRolesForUser(userObj), ['editor'])
  })

  it('getRolesForUser should not fail during a call of addUsersToRoles', function () {
    Roles.createRole('editor')

    const userId = users.eve
    const promises = []
    const interval = setInterval(() => {
      promises.push(Promise.resolve().then(() => { Roles.getRolesForUser(userId) }))
    }, 0)

    Roles.addUsersToRoles([users.eve], ['editor'], Roles.GLOBAL_SCOPE)
    clearInterval(interval)

    return Promise.all(promises)
  })

  it('returns an empty list of scopes for null as user-id', function () {
    assert.sameMembers(Roles.getScopesForUser(undefined), [])
    assert.sameMembers(Roles.getScopesForUser(null), [])
    assert.sameMembers(Roles.getScopesForUser('foo'), [])
    assert.sameMembers(Roles.getScopesForUser({}), [])
    assert.sameMembers(Roles.getScopesForUser({ _id: 'foo' }), [])
  })

  it('can get all scopes for user', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    const userId = users.eve

    Roles.addUsersToRoles([users.eve], ['editor'], 'scope1')
    Roles.addUsersToRoles([users.eve], ['admin', 'user'], 'scope2')

    // by userId
    assert.sameMembers(Roles.getScopesForUser(userId), ['scope1', 'scope2'])

    // by user object
    const userObj = Meteor.users.findOne({ _id: userId })
    assert.sameMembers(Roles.getScopesForUser(userObj), ['scope1', 'scope2'])
  })

  it('can get all scopes for user by role', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    const userId = users.eve

    Roles.addUsersToRoles([users.eve], ['editor'], 'scope1')
    Roles.addUsersToRoles([users.eve], ['editor', 'user'], 'scope2')

    // by userId
    assert.sameMembers(Roles.getScopesForUser(userId, 'user'), ['scope2'])
    assert.sameMembers(Roles.getScopesForUser(userId, 'editor'), ['scope1', 'scope2'])
    assert.sameMembers(Roles.getScopesForUser(userId, 'admin'), [])

    // by user object
    const userObj = Meteor.users.findOne({ _id: userId })
    assert.sameMembers(Roles.getScopesForUser(userObj, 'user'), ['scope2'])
    assert.sameMembers(Roles.getScopesForUser(userObj, 'editor'), ['scope1', 'scope2'])
    assert.sameMembers(Roles.getScopesForUser(userObj, 'admin'), [])
  })

  it('getScopesForUser returns [] when not using scopes', function () {
    Roles.createRole('user')
    Roles.createRole('editor')

    const userId = users.eve

    Roles.addUsersToRoles([users.eve], ['editor', 'user'])

    // by userId
    assert.sameMembers(Roles.getScopesForUser(userId), [])
    assert.sameMembers(Roles.getScopesForUser(userId, 'editor'), [])
    assert.sameMembers(Roles.getScopesForUser(userId, ['editor']), [])
    assert.sameMembers(Roles.getScopesForUser(userId, ['editor', 'user']), [])

    // by user object
    const userObj = Meteor.users.findOne({ _id: userId })
    assert.sameMembers(Roles.getScopesForUser(userObj), [])
    assert.sameMembers(Roles.getScopesForUser(userObj, 'editor'), [])
    assert.sameMembers(Roles.getScopesForUser(userObj, ['editor']), [])
    assert.sameMembers(Roles.getScopesForUser(userObj, ['editor', 'user']), [])
  })

  it('can get all groups for user by role array', function () {
    const userId = users.eve

    Roles.createRole('user')
    Roles.createRole('editor')
    Roles.createRole('moderator')
    Roles.createRole('admin')

    Roles.addUsersToRoles([users.eve], ['editor'], 'group1')
    Roles.addUsersToRoles([users.eve], ['editor', 'user'], 'group2')
    Roles.addUsersToRoles([users.eve], ['moderator'], 'group3')

    // by userId, one role
    assert.sameMembers(Roles.getScopesForUser(userId, ['user']), ['group2'])
    assert.sameMembers(Roles.getScopesForUser(userId, ['editor']), ['group1', 'group2'])
    assert.sameMembers(Roles.getScopesForUser(userId, ['admin']), [])

    // by userId, multiple roles
    assert.sameMembers(Roles.getScopesForUser(userId, ['editor', 'user']), ['group1', 'group2'])
    assert.sameMembers(Roles.getScopesForUser(userId, ['editor', 'moderator']), ['group1', 'group2', 'group3'])
    assert.sameMembers(Roles.getScopesForUser(userId, ['user', 'moderator']), ['group2', 'group3'])

    // by user object, one role
    const userObj = Meteor.users.findOne({ _id: userId })
    assert.sameMembers(Roles.getScopesForUser(userObj, ['user']), ['group2'])
    assert.sameMembers(Roles.getScopesForUser(userObj, ['editor']), ['group1', 'group2'])
    assert.sameMembers(Roles.getScopesForUser(userObj, ['admin']), [])

    // by user object, multiple roles
    assert.sameMembers(Roles.getScopesForUser(userObj, ['editor', 'user']), ['group1', 'group2'])
    assert.sameMembers(Roles.getScopesForUser(userObj, ['editor', 'moderator']), ['group1', 'group2', 'group3'])
    assert.sameMembers(Roles.getScopesForUser(userObj, ['user', 'moderator']), ['group2', 'group3'])
  })

  it('getting all scopes for user does not include GLOBAL_SCOPE', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    const userId = users.eve

    Roles.addUsersToRoles([users.eve], ['editor'], 'scope1')
    Roles.addUsersToRoles([users.eve], ['editor', 'user'], 'scope2')
    Roles.addUsersToRoles([users.eve], ['editor', 'user', 'admin'], Roles.GLOBAL_SCOPE)

    // by userId
    assert.sameMembers(Roles.getScopesForUser(userId, 'user'), ['scope2'])
    assert.sameMembers(Roles.getScopesForUser(userId, 'editor'), ['scope1', 'scope2'])
    assert.sameMembers(Roles.getScopesForUser(userId, 'admin'), [])
    assert.sameMembers(Roles.getScopesForUser(userId, ['user']), ['scope2'])
    assert.sameMembers(Roles.getScopesForUser(userId, ['editor']), ['scope1', 'scope2'])
    assert.sameMembers(Roles.getScopesForUser(userId, ['admin']), [])
    assert.sameMembers(Roles.getScopesForUser(userId, ['user', 'editor', 'admin']), ['scope1', 'scope2'])

    // by user object
    const userObj = Meteor.users.findOne({ _id: userId })
    assert.sameMembers(Roles.getScopesForUser(userObj, 'user'), ['scope2'])
    assert.sameMembers(Roles.getScopesForUser(userObj, 'editor'), ['scope1', 'scope2'])
    assert.sameMembers(Roles.getScopesForUser(userObj, 'admin'), [])
    assert.sameMembers(Roles.getScopesForUser(userObj, ['user']), ['scope2'])
    assert.sameMembers(Roles.getScopesForUser(userObj, ['editor']), ['scope1', 'scope2'])
    assert.sameMembers(Roles.getScopesForUser(userObj, ['admin']), [])
    assert.sameMembers(Roles.getScopesForUser(userObj, ['user', 'editor', 'admin']), ['scope1', 'scope2'])
  })

  it('can get all users in role', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    Roles.addUsersToRoles([users.eve, users.joe], ['admin', 'user'])
    Roles.addUsersToRoles([users.bob, users.joe], ['editor'])

    const expected = [users.eve, users.joe]
    const actual = Roles.getUsersInRole('admin').fetch().map(r => r._id)

    assert.sameMembers(actual, expected)
  })

  it('can get all users in role by scope', function () {
    Roles.createRole('admin')
    Roles.createRole('user')

    Roles.addUsersToRoles([users.eve, users.joe], ['admin', 'user'], 'scope1')
    Roles.addUsersToRoles([users.bob, users.joe], ['admin'], 'scope2')

    let expected = [users.eve, users.joe]
    let actual = Roles.getUsersInRole('admin', 'scope1').fetch().map(r => r._id)

    assert.sameMembers(actual, expected)

    expected = [users.eve, users.joe]
    actual = Roles.getUsersInRole('admin', { scope: 'scope1' }).fetch().map(r => r._id)
    assert.sameMembers(actual, expected)

    expected = [users.eve, users.bob, users.joe]
    actual = Roles.getUsersInRole('admin', { anyScope: true }).fetch().map(r => r._id)
    assert.sameMembers(actual, expected)

    actual = Roles.getUsersInRole('admin').fetch().map(r => r._id)
    assert.sameMembers(actual, [])
  })

  it('can get all users in role by scope including Roles.GLOBAL_SCOPE', function () {
    Roles.createRole('admin')
    Roles.createRole('user')

    Roles.addUsersToRoles([users.eve], ['admin', 'user'], Roles.GLOBAL_SCOPE)
    Roles.addUsersToRoles([users.bob, users.joe], ['admin'], 'scope2')

    let expected = [users.eve]
    let actual = Roles.getUsersInRole('admin', 'scope1').fetch().map(r => r._id)

    assert.sameMembers(actual, expected)

    expected = [users.eve, users.bob, users.joe]
    actual = Roles.getUsersInRole('admin', 'scope2').fetch().map(r => r._id)

    assert.sameMembers(actual, expected)

    expected = [users.eve]
    actual = Roles.getUsersInRole('admin').fetch().map(r => r._id)

    assert.sameMembers(actual, expected)

    expected = [users.eve, users.bob, users.joe]
    actual = Roles.getUsersInRole('admin', { anyScope: true }).fetch().map(r => r._id)

    assert.sameMembers(actual, expected)
  })

  it('can get all users in role by scope excluding Roles.GLOBAL_SCOPE', function () {
    Roles.createRole('admin')

    Roles.addUsersToRoles([users.eve], ['admin'], Roles.GLOBAL_SCOPE)
    Roles.addUsersToRoles([users.bob], ['admin'], 'scope1')

    let expected = [users.eve]
    let actual = Roles.getUsersInRole('admin').fetch().map(r => r._id)
    assert.sameMembers(actual, expected)

    expected = [users.eve, users.bob]
    actual = Roles.getUsersInRole('admin', { scope: 'scope1' }).fetch().map(r => r._id)
    assert.sameMembers(actual, expected)

    expected = [users.bob]
    actual = Roles.getUsersInRole('admin', { scope: 'scope1', onlyScoped: true }).fetch().map(r => r._id)
    assert.sameMembers(actual, expected)
  })

  it('can get all users in role by scope and passes through mongo query arguments', function () {
    Roles.createRole('admin')
    Roles.createRole('user')

    Roles.addUsersToRoles([users.eve, users.joe], ['admin', 'user'], 'scope1')
    Roles.addUsersToRoles([users.bob, users.joe], ['admin'], 'scope2')

    const results = Roles.getUsersInRole('admin', 'scope1', { fields: { username: 0 }, limit: 1 }).fetch()

    assert.equal(1, results.length)
    assert.isTrue(hasProp(results[0], '_id'))
    assert.isFalse(hasProp(results[0], 'username'))
  })

  it('can use Roles.GLOBAL_SCOPE to assign blanket roles', function () {
    Roles.createRole('admin')

    Roles.addUsersToRoles([users.joe, users.bob], ['admin'], Roles.GLOBAL_SCOPE)

    testUser('eve', [], 'scope1')
    testUser('joe', ['admin'], 'scope2')
    testUser('joe', ['admin'], 'scope1')
    testUser('bob', ['admin'], 'scope2')
    testUser('bob', ['admin'], 'scope1')

    Roles.removeUsersFromRoles(users.joe, ['admin'], Roles.GLOBAL_SCOPE)

    testUser('eve', [], 'scope1')
    testUser('joe', [], 'scope2')
    testUser('joe', [], 'scope1')
    testUser('bob', ['admin'], 'scope2')
    testUser('bob', ['admin'], 'scope1')
  })

  it('Roles.GLOBAL_SCOPE is independent of other scopes', function () {
    Roles.createRole('admin')

    Roles.addUsersToRoles([users.joe, users.bob], ['admin'], 'scope5')
    Roles.addUsersToRoles([users.joe, users.bob], ['admin'], Roles.GLOBAL_SCOPE)

    testUser('eve', [], 'scope1')
    testUser('joe', ['admin'], 'scope5')
    testUser('joe', ['admin'], 'scope2')
    testUser('joe', ['admin'], 'scope1')
    testUser('bob', ['admin'], 'scope5')
    testUser('bob', ['admin'], 'scope2')
    testUser('bob', ['admin'], 'scope1')

    Roles.removeUsersFromRoles(users.joe, ['admin'], Roles.GLOBAL_SCOPE)

    testUser('eve', [], 'scope1')
    testUser('joe', ['admin'], 'scope5')
    testUser('joe', [], 'scope2')
    testUser('joe', [], 'scope1')
    testUser('bob', ['admin'], 'scope5')
    testUser('bob', ['admin'], 'scope2')
    testUser('bob', ['admin'], 'scope1')
  })

  it('Roles.GLOBAL_SCOPE also checked when scope not specified', function () {
    Roles.createRole('admin')

    Roles.addUsersToRoles(users.joe, 'admin', Roles.GLOBAL_SCOPE)

    testUser('joe', ['admin'])

    Roles.removeUsersFromRoles(users.joe, 'admin', Roles.GLOBAL_SCOPE)

    testUser('joe', [])
  })

  it('can use \'.\' in scope name', function () {
    Roles.createRole('admin')

    Roles.addUsersToRoles(users.joe, ['admin'], 'example.com')
    testUser('joe', ['admin'], 'example.com')
  })

  it('can use multiple periods in scope name', function () {
    Roles.createRole('admin')

    Roles.addUsersToRoles(users.joe, ['admin'], 'example.k12.va.us')
    testUser('joe', ['admin'], 'example.k12.va.us')
  })

  it('renaming of roles', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')

    Roles.setUserRoles([users.eve, users.bob], ['editor', 'user'], 'scope1')
    Roles.setUserRoles([users.bob, users.joe], ['user', 'admin'], 'scope2')

    assert.isTrue(Roles.userIsInRole(users.eve, 'editor', 'scope1'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'editor', 'scope2'))

    assert.isFalse(Roles.userIsInRole(users.joe, 'admin', 'scope1'))
    assert.isTrue(Roles.userIsInRole(users.joe, 'admin', 'scope2'))

    assert.isTrue(Roles.userIsInRole(users.eve, 'user', 'scope1'))
    assert.isTrue(Roles.userIsInRole(users.bob, 'user', 'scope1'))
    assert.isFalse(Roles.userIsInRole(users.joe, 'user', 'scope1'))

    assert.isFalse(Roles.userIsInRole(users.eve, 'user', 'scope2'))
    assert.isTrue(Roles.userIsInRole(users.bob, 'user', 'scope2'))
    assert.isTrue(Roles.userIsInRole(users.joe, 'user', 'scope2'))

    assert.isFalse(Roles.userIsInRole(users.eve, 'user2', 'scope1'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'user2', 'scope2'))

    Roles.renameRole('user', 'user2')

    assert.isTrue(Roles.userIsInRole(users.eve, 'editor', 'scope1'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'editor', 'scope2'))

    assert.isFalse(Roles.userIsInRole(users.joe, 'admin', 'scope1'))
    assert.isTrue(Roles.userIsInRole(users.joe, 'admin', 'scope2'))

    assert.isTrue(Roles.userIsInRole(users.eve, 'user2', 'scope1'))
    assert.isTrue(Roles.userIsInRole(users.bob, 'user2', 'scope1'))
    assert.isFalse(Roles.userIsInRole(users.joe, 'user2', 'scope1'))

    assert.isFalse(Roles.userIsInRole(users.eve, 'user2', 'scope2'))
    assert.isTrue(Roles.userIsInRole(users.bob, 'user2', 'scope2'))
    assert.isTrue(Roles.userIsInRole(users.joe, 'user2', 'scope2'))

    assert.isFalse(Roles.userIsInRole(users.eve, 'user', 'scope1'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'user', 'scope2'))
  })

  it('migration without global groups (to v2)', function () {
    assert.isOk(Meteor.roles.insert({ name: 'admin' }))
    assert.isOk(Meteor.roles.insert({ name: 'editor' }))
    assert.isOk(Meteor.roles.insert({ name: 'user' }))

    assert.isOk(Meteor.users.update(users.eve, { $set: { roles: ['admin', 'editor'] } }))
    assert.isOk(Meteor.users.update(users.bob, { $set: { roles: [] } }))
    assert.isOk(Meteor.users.update(users.joe, { $set: { roles: ['user'] } }))

    Roles._forwardMigrate()

    assert.deepEqual(Meteor.users.findOne(users.eve, { fields: { roles: 1, _id: 0 } }), {
      roles: [{
        _id: 'admin',
        scope: null,
        assigned: true
      }, {
        _id: 'editor',
        scope: null,
        assigned: true
      }]
    })
    assert.deepEqual(Meteor.users.findOne(users.bob, { fields: { roles: 1, _id: 0 } }), {
      roles: []
    })
    assert.deepEqual(Meteor.users.findOne(users.joe, { fields: { roles: 1, _id: 0 } }), {
      roles: [{
        _id: 'user',
        scope: null,
        assigned: true
      }]
    })

    assert.deepEqual(Meteor.roles.findOne({ _id: 'admin' }), {
      _id: 'admin',
      children: []
    })
    assert.deepEqual(Meteor.roles.findOne({ _id: 'editor' }), {
      _id: 'editor',
      children: []
    })
    assert.deepEqual(Meteor.roles.findOne({ _id: 'user' }), {
      _id: 'user',
      children: []
    })

    Roles._backwardMigrate(null, null, false)

    assert.deepEqual(Meteor.users.findOne(users.eve, { fields: { roles: 1, _id: 0 } }), {
      roles: ['admin', 'editor']
    })
    assert.deepEqual(Meteor.users.findOne(users.bob, { fields: { roles: 1, _id: 0 } }), {
      roles: []
    })
    assert.deepEqual(Meteor.users.findOne(users.joe, { fields: { roles: 1, _id: 0 } }), {
      roles: ['user']
    })

    assert.deepEqual(Meteor.roles.findOne({ name: 'admin' }, { fields: { _id: 0 } }), {
      name: 'admin'
    })
    assert.deepEqual(Meteor.roles.findOne({ name: 'editor' }, { fields: { _id: 0 } }), {
      name: 'editor'
    })
    assert.deepEqual(Meteor.roles.findOne({ name: 'user' }, { fields: { _id: 0 } }), {
      name: 'user'
    })
  })

  it('migration without global groups (to v3)')

  it('migration with global groups (to v2)', function () {
    assert.isOk(Meteor.roles.insert({ name: 'admin' }))
    assert.isOk(Meteor.roles.insert({ name: 'editor' }))
    assert.isOk(Meteor.roles.insert({ name: 'user' }))

    assert.isOk(Meteor.users.update(users.eve, { $set: { roles: { __global_roles__: ['admin', 'editor'], foo_bla: ['user'] } } }))
    assert.isOk(Meteor.users.update(users.bob, { $set: { roles: { } } }))
    assert.isOk(Meteor.users.update(users.joe, { $set: { roles: { __global_roles__: ['user'], foo_bla: ['user'] } } }))

    Roles._forwardMigrate(null, null, false)

    assert.deepEqual(Meteor.users.findOne(users.eve, { fields: { roles: 1, _id: 0 } }), {
      roles: [{
        _id: 'admin',
        scope: null,
        assigned: true
      }, {
        _id: 'editor',
        scope: null,
        assigned: true
      }, {
        _id: 'user',
        scope: 'foo_bla',
        assigned: true
      }]
    })
    assert.deepEqual(Meteor.users.findOne(users.bob, { fields: { roles: 1, _id: 0 } }), {
      roles: []
    })
    assert.deepEqual(Meteor.users.findOne(users.joe, { fields: { roles: 1, _id: 0 } }), {
      roles: [{
        _id: 'user',
        scope: null,
        assigned: true
      }, {
        _id: 'user',
        scope: 'foo_bla',
        assigned: true
      }]
    })

    assert.deepEqual(Meteor.roles.findOne({ _id: 'admin' }), {
      _id: 'admin',
      children: []
    })
    assert.deepEqual(Meteor.roles.findOne({ _id: 'editor' }), {
      _id: 'editor',
      children: []
    })
    assert.deepEqual(Meteor.roles.findOne({ _id: 'user' }), {
      _id: 'user',
      children: []
    })

    Roles._backwardMigrate(null, null, true)

    assert.deepEqual(Meteor.users.findOne(users.eve, { fields: { roles: 1, _id: 0 } }), {
      roles: {
        __global_roles__: ['admin', 'editor'],
        foo_bla: ['user']
      }
    })
    assert.deepEqual(Meteor.users.findOne(users.bob, { fields: { roles: 1, _id: 0 } }), {
      roles: {}
    })
    assert.deepEqual(Meteor.users.findOne(users.joe, { fields: { roles: 1, _id: 0 } }), {
      roles: {
        __global_roles__: ['user'],
        foo_bla: ['user']
      }
    })

    assert.deepEqual(Meteor.roles.findOne({ name: 'admin' }, { fields: { _id: 0 } }), {
      name: 'admin'
    })
    assert.deepEqual(Meteor.roles.findOne({ name: 'editor' }, { fields: { _id: 0 } }), {
      name: 'editor'
    })
    assert.deepEqual(Meteor.roles.findOne({ name: 'user' }, { fields: { _id: 0 } }), {
      name: 'user'
    })

    Roles._forwardMigrate(null, null, true)

    assert.deepEqual(Meteor.users.findOne(users.eve, { fields: { roles: 1, _id: 0 } }), {
      roles: [{
        _id: 'admin',
        scope: null,
        assigned: true
      }, {
        _id: 'editor',
        scope: null,
        assigned: true
      }, {
        _id: 'user',
        scope: 'foo.bla',
        assigned: true
      }]
    })
    assert.deepEqual(Meteor.users.findOne(users.bob, { fields: { roles: 1, _id: 0 } }), {
      roles: []
    })
    assert.deepEqual(Meteor.users.findOne(users.joe, { fields: { roles: 1, _id: 0 } }), {
      roles: [{
        _id: 'user',
        scope: null,
        assigned: true
      }, {
        _id: 'user',
        scope: 'foo.bla',
        assigned: true
      }]
    })

    assert.deepEqual(Meteor.roles.findOne({ _id: 'admin' }), {
      _id: 'admin',
      children: []
    })
    assert.deepEqual(Meteor.roles.findOne({ _id: 'editor' }), {
      _id: 'editor',
      children: []
    })
    assert.deepEqual(Meteor.roles.findOne({ _id: 'user' }), {
      _id: 'user',
      children: []
    })
  })

  it('migration with global groups (to v3)')

  it('_addUserToRole', function () {
    Roles.createRole('admin')

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [])

    assert.include(
      Object.keys(Roles._addUserToRole(users.eve, 'admin', { scope: null, ifExists: false })),
      'insertedId'
    )

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'admin' }]
    }])

    assert.notInclude(
      Object.keys(Roles._addUserToRole(users.eve, 'admin', { scope: null, ifExists: false })),
      'insertedId'
    )

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'admin' }]
    }])
  })

  it('_removeUserFromRole', function () {
    Roles.createRole('admin')

    Roles.addUsersToRoles(users.eve, 'admin')

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'admin' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'admin' }]
    }])

    Roles._removeUserFromRole(users.eve, 'admin', { scope: null })

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [])
  })

  it('keep assigned roles', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('ALL_PERMISSIONS')
    Roles.createRole('VIEW_PERMISSION')
    Roles.createRole('EDIT_PERMISSION')
    Roles.createRole('DELETE_PERMISSION')
    Roles.addRolesToParent('ALL_PERMISSIONS', 'user')
    Roles.addRolesToParent('EDIT_PERMISSION', 'ALL_PERMISSIONS')
    Roles.addRolesToParent('VIEW_PERMISSION', 'ALL_PERMISSIONS')
    Roles.addRolesToParent('DELETE_PERMISSION', 'admin')

    Roles.addUsersToRoles(users.eve, ['user'])

    assert.isTrue(Roles.userIsInRole(users.eve, 'VIEW_PERMISSION'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
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

    Roles.addUsersToRoles(users.eve, 'VIEW_PERMISSION')

    assert.isTrue(Roles.userIsInRole(users.eve, 'VIEW_PERMISSION'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
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

    Roles.removeUsersFromRoles(users.eve, 'user')

    assert.isTrue(Roles.userIsInRole(users.eve, 'VIEW_PERMISSION'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'VIEW_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'VIEW_PERMISSION' }
      ]
    }])

    Roles.removeUsersFromRoles(users.eve, 'VIEW_PERMISSION')

    assert.isFalse(Roles.userIsInRole(users.eve, 'VIEW_PERMISSION'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [])
  })

  it('adds children of the added role to the assignments', function () {
    Roles.createRole('admin')
    Roles.createRole('ALBUM.ADMIN')
    Roles.createRole('ALBUM.VIEW')
    Roles.createRole('TRACK.ADMIN')
    Roles.createRole('TRACK.VIEW')

    Roles.addRolesToParent('ALBUM.VIEW', 'ALBUM.ADMIN')
    Roles.addRolesToParent('TRACK.VIEW', 'TRACK.ADMIN')

    Roles.addRolesToParent('ALBUM.ADMIN', 'admin')

    Roles.addUsersToRoles(users.eve, ['admin'])

    assert.isFalse(Roles.userIsInRole(users.eve, 'TRACK.VIEW'))

    Roles.addRolesToParent('TRACK.ADMIN', 'admin')

    assert.isTrue(Roles.userIsInRole(users.eve, 'TRACK.VIEW'))
  })

  it('removes children of the removed role from the assignments', function () {
    Roles.createRole('admin')
    Roles.createRole('ALBUM.ADMIN')
    Roles.createRole('ALBUM.VIEW')
    Roles.createRole('TRACK.ADMIN')
    Roles.createRole('TRACK.VIEW')

    Roles.addRolesToParent('ALBUM.VIEW', 'ALBUM.ADMIN')
    Roles.addRolesToParent('TRACK.VIEW', 'TRACK.ADMIN')

    Roles.addRolesToParent('ALBUM.ADMIN', 'admin')
    Roles.addRolesToParent('TRACK.ADMIN', 'admin')

    Roles.addUsersToRoles(users.eve, ['admin'])

    assert.isTrue(Roles.userIsInRole(users.eve, 'TRACK.VIEW'))

    Roles.removeRolesFromParent('TRACK.ADMIN', 'admin')

    assert.isFalse(Roles.userIsInRole(users.eve, 'TRACK.VIEW'))
  })

  it('modify assigned hierarchical roles', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('ALL_PERMISSIONS')
    Roles.createRole('VIEW_PERMISSION')
    Roles.createRole('EDIT_PERMISSION')
    Roles.createRole('DELETE_PERMISSION')
    Roles.addRolesToParent('ALL_PERMISSIONS', 'user')
    Roles.addRolesToParent('EDIT_PERMISSION', 'ALL_PERMISSIONS')
    Roles.addRolesToParent('VIEW_PERMISSION', 'ALL_PERMISSIONS')
    Roles.addRolesToParent('DELETE_PERMISSION', 'admin')

    Roles.addUsersToRoles(users.eve, ['user'])
    Roles.addUsersToRoles(users.eve, ['ALL_PERMISSIONS'], 'scope')

    assert.isFalse(Roles.userIsInRole(users.eve, 'MODERATE_PERMISSION'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'MODERATE_PERMISSION', 'scope'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
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

    Roles.createRole('MODERATE_PERMISSION')

    Roles.addRolesToParent('MODERATE_PERMISSION', 'ALL_PERMISSIONS')

    assert.isTrue(Roles.userIsInRole(users.eve, 'MODERATE_PERMISSION'))
    assert.isTrue(Roles.userIsInRole(users.eve, 'MODERATE_PERMISSION', 'scope'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
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

    Roles.addUsersToRoles(users.eve, ['admin'])

    assert.isTrue(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION'))
    assert.isTrue(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION', 'scope'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
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

    Roles.addRolesToParent('DELETE_PERMISSION', 'ALL_PERMISSIONS')

    assert.isTrue(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION'))
    assert.isTrue(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION', 'scope'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
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

    Roles.removeUsersFromRoles(users.eve, ['admin'])

    assert.isTrue(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION'))
    assert.isTrue(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION', 'scope'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
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

    Roles.deleteRole('ALL_PERMISSIONS')

    assert.isFalse(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION', 'scope'))

    assert.isFalse(Roles.userIsInRole(users.eve, 'MODERATE_PERMISSION'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'MODERATE_PERMISSION', 'scope'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'user' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [
        { _id: 'user' }
      ]
    }])
  })

  it('delete role with overlapping hierarchical roles', function () {
    Roles.createRole('role1')
    Roles.createRole('role2')
    Roles.createRole('COMMON_PERMISSION_1')
    Roles.createRole('COMMON_PERMISSION_2')
    Roles.createRole('COMMON_PERMISSION_3')
    Roles.createRole('EXTRA_PERMISSION_ROLE_1')
    Roles.createRole('EXTRA_PERMISSION_ROLE_2')

    Roles.addRolesToParent('COMMON_PERMISSION_1', 'role1')
    Roles.addRolesToParent('COMMON_PERMISSION_2', 'role1')
    Roles.addRolesToParent('COMMON_PERMISSION_3', 'role1')
    Roles.addRolesToParent('EXTRA_PERMISSION_ROLE_1', 'role1')

    Roles.addRolesToParent('COMMON_PERMISSION_1', 'role2')
    Roles.addRolesToParent('COMMON_PERMISSION_2', 'role2')
    Roles.addRolesToParent('COMMON_PERMISSION_3', 'role2')
    Roles.addRolesToParent('EXTRA_PERMISSION_ROLE_2', 'role2')

    Roles.addUsersToRoles(users.eve, 'role1')
    Roles.addUsersToRoles(users.eve, 'role2')

    assert.isTrue(Roles.userIsInRole(users.eve, 'COMMON_PERMISSION_1'))
    assert.isTrue(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_1'))
    assert.isTrue(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_2'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
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

    Roles.removeUsersFromRoles(users.eve, 'role2')

    assert.isTrue(Roles.userIsInRole(users.eve, 'COMMON_PERMISSION_1'))
    assert.isTrue(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_1'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_2'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
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

    Roles.addUsersToRoles(users.eve, 'role2')

    assert.isTrue(Roles.userIsInRole(users.eve, 'COMMON_PERMISSION_1'))
    assert.isTrue(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_1'))
    assert.isTrue(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_2'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
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

    Roles.deleteRole('role2')

    assert.isTrue(Roles.userIsInRole(users.eve, 'COMMON_PERMISSION_1'))
    assert.isTrue(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_1'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_2'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
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

  it('set parent on assigned role', function () {
    Roles.createRole('admin')
    Roles.createRole('EDIT_PERMISSION')

    Roles.addUsersToRoles(users.eve, 'EDIT_PERMISSION')

    assert.isTrue(Roles.userIsInRole(users.eve, 'EDIT_PERMISSION'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'admin'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'EDIT_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
    }])

    Roles.addRolesToParent('EDIT_PERMISSION', 'admin')

    assert.isTrue(Roles.userIsInRole(users.eve, 'EDIT_PERMISSION'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'admin'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'EDIT_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
    }])
  })

  it('remove parent on assigned role', function () {
    Roles.createRole('admin')
    Roles.createRole('EDIT_PERMISSION')

    Roles.addRolesToParent('EDIT_PERMISSION', 'admin')

    Roles.addUsersToRoles(users.eve, 'EDIT_PERMISSION')

    assert.isTrue(Roles.userIsInRole(users.eve, 'EDIT_PERMISSION'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'admin'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'EDIT_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
    }])

    Roles.removeRolesFromParent('EDIT_PERMISSION', 'admin')

    assert.isTrue(Roles.userIsInRole(users.eve, 'EDIT_PERMISSION'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'admin'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'EDIT_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
    }])
  })

  it('adding and removing extra role parents', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('EDIT_PERMISSION')

    Roles.addRolesToParent('EDIT_PERMISSION', 'admin')

    Roles.addUsersToRoles(users.eve, 'EDIT_PERMISSION')

    assert.isTrue(Roles.userIsInRole(users.eve, 'EDIT_PERMISSION'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'admin'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'EDIT_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
    }])

    Roles.addRolesToParent('EDIT_PERMISSION', 'user')

    assert.isTrue(Roles.userIsInRole(users.eve, 'EDIT_PERMISSION'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'admin'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'EDIT_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
    }])

    Roles.removeRolesFromParent('EDIT_PERMISSION', 'user')

    assert.isTrue(Roles.userIsInRole(users.eve, 'EDIT_PERMISSION'))
    assert.isFalse(Roles.userIsInRole(users.eve, 'admin'))

    assert.sameDeepMembers(Roles.getRolesForUser(users.eve, { anyScope: true, fullObjects: true }).map(obj => { delete obj._id; return obj }), [{
      role: { _id: 'EDIT_PERMISSION' },
      scope: null,
      user: { _id: users.eve },
      inheritedRoles: [{ _id: 'EDIT_PERMISSION' }]
    }])
  })

  it('cyclic roles', function () {
    Roles.createRole('admin')
    Roles.createRole('editor')
    Roles.createRole('user')

    Roles.addRolesToParent('editor', 'admin')
    Roles.addRolesToParent('user', 'editor')

    assert.throws(function () {
      Roles.addRolesToParent('admin', 'user')
    }, /form a cycle/)
  })

  it('userIsInRole returns false for unknown roles', function () {
    Roles.createRole('admin')
    Roles.createRole('user')
    Roles.createRole('editor')
    Roles.addUsersToRoles(users.eve, ['admin', 'user'])
    Roles.addUsersToRoles(users.eve, ['editor'])

    assert.isFalse(Roles.userIsInRole(users.eve, 'unknown'))
    assert.isFalse(Roles.userIsInRole(users.eve, []))
    assert.isFalse(Roles.userIsInRole(users.eve, null))
    assert.isFalse(Roles.userIsInRole(users.eve, undefined))

    assert.isFalse(Roles.userIsInRole(users.eve, 'unknown', { anyScope: true }))
    assert.isFalse(Roles.userIsInRole(users.eve, [], { anyScope: true }))
    assert.isFalse(Roles.userIsInRole(users.eve, null, { anyScope: true }))
    assert.isFalse(Roles.userIsInRole(users.eve, undefined, { anyScope: true }))

    assert.isFalse(Roles.userIsInRole(users.eve, ['Role1', 'Role2', undefined], 'GroupName'))
  })

  it('userIsInRole returns false if user is a function', function () {
    Roles.createRole('admin')
    Roles.addUsersToRoles(users.eve, ['admin'])

    assert.isFalse(Roles.userIsInRole(() => {}, 'admin'))
  })

  describe('isParentOf', function () {
    it('returns false for unknown roles', function () {
      Roles.createRole('admin')

      assert.isFalse(Roles.isParentOf('admin', 'unknown'))
      assert.isFalse(Roles.isParentOf('admin', null))
      assert.isFalse(Roles.isParentOf('admin', undefined))

      assert.isFalse(Roles.isParentOf('unknown', 'admin'))
      assert.isFalse(Roles.isParentOf(null, 'admin'))
      assert.isFalse(Roles.isParentOf(undefined, 'admin'))
    })

    it('returns false if role is not parent of', function () {
      Roles.createRole('admin')
      Roles.createRole('editor')
      Roles.createRole('user')
      Roles.addRolesToParent(['editor'], 'admin')
      Roles.addRolesToParent(['user'], 'editor')

      assert.isFalse(Roles.isParentOf('user', 'admin'))
      assert.isFalse(Roles.isParentOf('editor', 'admin'))
    })

    it('returns true if role is parent of the demanded role', function () {
      Roles.createRole('admin')
      Roles.createRole('editor')
      Roles.createRole('user')
      Roles.addRolesToParent(['editor'], 'admin')
      Roles.addRolesToParent(['user'], 'editor')

      assert.isTrue(Roles.isParentOf('admin', 'user'))
      assert.isTrue(Roles.isParentOf('editor', 'user'))
      assert.isTrue(Roles.isParentOf('admin', 'editor'))

      assert.isTrue(Roles.isParentOf('admin', 'admin'))
      assert.isTrue(Roles.isParentOf('editor', 'editor'))
      assert.isTrue(Roles.isParentOf('user', 'user'))
    })
  })
})
