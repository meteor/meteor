// NOTE: This file is incomplete.  I can't figure out how to test
// the server-side code using Tinytest.
//
// Problem is we need users

;(function () {


  var users = {},
      roles = ['admin','editor','user']


  function addUser (name) {
    return Accounts.createUser({'username': name})
  }

  function reset () {
    Meteor.roles.remove({})
    Meteor.users.remove({})

    users = {
      'eve': addUser('eve'),
      'bob': addUser('bob'),
      'joe': addUser('joe')
    }
  }


  function testUser (test, user, expectedRoles) {
    var userId = users[user]

    _.each(roles, function (role) {
      var expected = expectedRoles.indexOf(role) !== -1,
          msg = user + ' is not in expected role ' + role,
          nmsg = user + ' is in un-expected role ' + role

      if (expected) {
        test.isTrue(Roles.isUserInRole(userId, role), msg)
      } else {
        test.isFalse(Roles.isUserInRole(userId, role), nmsg)
      }
    })
  }

  Tinytest.add('create and delete roles', function (test) {
    reset()

    Roles.createRole('test1')
    test.equal(Meteor.roles.findOne().name, 'test1')

    Roles.createRole('test2')
    test.equal(Meteor.roles.findOne({'name':'test2'}).name, 'test2')

    test.equal(Meteor.roles.find().count(), 2)

    Roles.deleteRole('test1')
    test.equal(typeof Meteor.roles.findOne({'name':'test1'}), 'undefined')

    Roles.deleteRole('test2')
    test.equal(typeof Meteor.roles.findOne(), 'undefined')
  })

  Tinytest.add('is user in role', function (test) {
    reset()

    Meteor.users.update(
      {"_id":users.eve}, 
      {$addToSet: { roles: { $each: ['admin', 'user'] } } }
    )
    testUser(test, 'eve', ['admin', 'user'])
  })

  Tinytest.add('add users to roles', function (test) {
    reset() 

    _.each(roles, function (role) {
      Roles.createRole(role)
    })

    Roles.addUsersToRoles([users.eve, users.bob], ['admin', 'user'])

    testUser(test, 'eve', ['admin', 'user'])
    testUser(test, 'bob', ['admin', 'user'])
    testUser(test, 'joe', [], roles)

    Roles.addUsersToRoles([users.joe], ['editor', 'user'])

    testUser(test, 'eve', ['admin', 'user'])
    testUser(test, 'bob', ['admin', 'user'])
    testUser(test, 'joe', ['editor', 'user'])
  })

  Tinytest.add('remove users from roles', function (test) {
    reset() 

    _.each(roles, function (role) {
      Roles.createRole(role)
    })

    // remove user role - one user
    Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'])
    testUser(test, 'eve', ['editor', 'user'])
    testUser(test, 'bob', ['editor', 'user'])
    Roles.removeUsersFromRoles([users.eve], ['user'])
    testUser(test, 'eve', ['editor'])
    testUser(test, 'bob', ['editor', 'user'])

    // try remove again
    Roles.removeUsersFromRoles([users.eve], ['user'])
    testUser(test, 'eve', ['editor'])

    // remove user role - two users
    test.isFalse(Roles.isUserInRole(users.joe, 'admin'))
    Roles.addUsersToRoles([users.bob, users.joe], ['admin', 'user'])
    testUser(test, 'bob', ['admin', 'user', 'editor'])
    testUser(test, 'joe', ['admin', 'user'])
    Roles.removeUsersFromRoles([users.bob, users.joe], ['admin'])
    testUser(test, 'bob', ['user', 'editor'])
    testUser(test, 'joe', ['user'])
  })

  Tinytest.add('add non-existing user to role', function (test) {
    reset()

    _.each(roles, function (role) {
      Roles.createRole(role)
    })

    Roles.addUsersToRoles(['1'], ['admin'])
    test.equal(Meteor.users.findOne({_id:'1'}), undefined)
  })

  Tinytest.add('empty role names are not allowed', function (test) {
    reset() 

    Roles.createRole('')
    Roles.createRole(null)

    test.equal(Meteor.roles.find().count(), 0)

    Roles.createRole(' ')
    test.equal(Meteor.roles.find().count(), 0)
  })

  Tinytest.add('get roles for user', function (test) {
    reset()
    _.each(roles, function (role) {
      Roles.createRole(role)
    })

    Roles.addUsersToRoles([users.eve], ['admin', 'user'])
    test.equal(Roles.getRolesForUser(users.eve), ['admin', 'user'])
  })

  Tinytest.add('get all roles', function (test) {
    reset()
    _.each(roles, function (role) {
      Roles.createRole(role)
    })

    // compare roles, sorted alphabetically
    var expected = roles,
        actual = _.pluck(Roles.getAllRoles().fetch(), 'name')

    test.equal(actual, expected)
  })


  Tinytest.add('is user in roles for non-existing user returns false', function (test) {
    reset()

    _.each(roles, function (role) {
      Roles.createRole(role)
    })

    test.isFalse(Roles.isUserInRole('1', 'admin'))
  })

  Tinytest.add('get users in role', function (test) {
    reset()
    _.each(roles, function (role) {
      Roles.createRole(role)
    })

    Roles.addUsersToRoles([users.eve, users.joe], ['admin', 'user'])

    var expected = [users.eve, users.joe],
        actual = _.pluck(Roles.getUsersInRole('admin').fetch(), '_id')

    // order may be different so check difference instead of equality
    test.equal(_.difference(actual, expected), [])
  })

}());
