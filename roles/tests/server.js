;(function () {

  var users = {},
      roles = ['admin','editor','user']

  // use to run individual tests
  //Tinytest.oadd = Tinytest.add
  //Tinytest.add = function () {}

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


  function testUser (test, username, expectedRoles, group) {
    var userId = users[username],
        userObj = Meteor.users.findOne({_id: userId})
        
    // check using user ids (makes db calls)
    _innerTest(test, userId, username, expectedRoles, group)

    // check using passed-in user object
    _innerTest(test, userObj, username, expectedRoles, group)
  }

  function _innerTest (test, userParam, username, expectedRoles, group) {
    // test that user has only the roles expected and no others
    _.each(roles, function (role) {
      var expected = _.contains(expectedRoles, role),
          msg = username + ' expected to have \'' + role + '\' permission but does not',
          nmsg = username + ' had the following un-expected permission: ' + role

      if (expected) {
        test.isTrue(Roles.userIsInRole(userParam, role, group), msg)
      } else {
        test.isFalse(Roles.userIsInRole(userParam, role, group), nmsg)
      }
    })
  }


  Tinytest.add(
    'roles - can create and delete roles', 
    function (test) {
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

  Tinytest.add(
    'roles - can\'t create duplicate roles', 
    function (test) {
      reset()

      Roles.createRole('test1')
      test.throws(function () {Roles.createRole('test1')})
    })

  Tinytest.add(
    'roles - can\'t create role with empty names', 
    function (test) {
      reset() 

      Roles.createRole('')
      Roles.createRole(null)

      test.equal(Meteor.roles.find().count(), 0)

      Roles.createRole(' ')
      test.equal(Meteor.roles.find().count(), 0)
    })

  Tinytest.add(
    'roles - can check if user is in role', 
    function (test) {
      reset()

      Meteor.users.update(
        {"_id":users.eve}, 
        {$addToSet: { roles: { $each: ['admin', 'user'] } } }
      )
      testUser(test, 'eve', ['admin', 'user'])
    })

  Tinytest.add(
    'roles - can check if user is in role by group', 
    function (test) {
      reset()

      Meteor.users.update(
        {"_id":users.eve}, 
        {$addToSet: { 'roles.group1': { $each: ['admin', 'user'] } } })
      Meteor.users.update(
        {"_id":users.eve}, 
        {$addToSet: { 'roles.group2': { $each: ['editor'] } } })

      testUser(test, 'eve', ['admin', 'user'], 'group1')
      testUser(test, 'eve', ['editor'], 'group2')
    })

  Tinytest.add(
    'roles - can check if non-existant user is in role', 
    function (test) {
      reset()

      test.isFalse(Roles.userIsInRole('1', 'admin'))
    })

  Tinytest.add(
    'roles - can check if null user is in role', 
    function (test) {
      var user = null
      reset()
      
      test.isFalse(Roles.userIsInRole(user, 'admin'))
    })

  Tinytest.add(
    'roles - can check user against several roles at once', 
    function (test) {
      var user 
      reset()

      Roles.addUsersToRoles(users.eve, ['admin', 'user'])
      user = Meteor.users.findOne({_id:users.eve})

      test.isTrue(Roles.userIsInRole(user, ['editor','admin']))
    })

  Tinytest.add(
    'roles - can\'t add non-existent user to role', 
    function (test) {
      reset()

      Roles.addUsersToRoles(['1'], ['admin'])
      test.equal(Meteor.users.findOne({_id:'1'}), undefined)
    })

  Tinytest.add(
    'roles - can add individual users to roles', 
    function (test) {
      reset() 

      Roles.addUsersToRoles(users.eve, ['admin', 'user'])

      testUser(test, 'eve', ['admin', 'user'])
      testUser(test, 'bob', [])
      testUser(test, 'joe', [])

      Roles.addUsersToRoles(users.joe, ['editor', 'user'])

      testUser(test, 'eve', ['admin', 'user'])
      testUser(test, 'bob', [])
      testUser(test, 'joe', ['editor', 'user'])
    })

  Tinytest.add(
    'roles - can add individual users to roles by group', 
    function (test) {
      reset() 

      Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'group1')

      testUser(test, 'eve', ['admin', 'user'], 'group1')
      testUser(test, 'bob', [], 'group1')
      testUser(test, 'joe', [], 'group1')

      testUser(test, 'eve', [], 'group2')
      testUser(test, 'bob', [], 'group2')
      testUser(test, 'joe', [], 'group2')

      Roles.addUsersToRoles(users.joe, ['editor', 'user'], 'group1')
      Roles.addUsersToRoles(users.bob, ['editor', 'user'], 'group2')

      testUser(test, 'eve', ['admin', 'user'], 'group1')
      testUser(test, 'bob', [], 'group1')
      testUser(test, 'joe', ['editor', 'user'], 'group1')

      testUser(test, 'eve', [], 'group2')
      testUser(test, 'bob', ['editor', 'user'], 'group2')
      testUser(test, 'joe', [], 'group2')
    })

  Tinytest.add(
    'roles - can add user to roles via user object', 
    function (test) {
      reset() 

      var eve = Meteor.users.findOne({_id: users.eve}),
          bob = Meteor.users.findOne({_id: users.bob})

      Roles.addUsersToRoles(eve, ['admin', 'user'])

      testUser(test, 'eve', ['admin', 'user'])
      testUser(test, 'bob', [])
      testUser(test, 'joe', [])

      Roles.addUsersToRoles(bob, ['editor'])

      testUser(test, 'eve', ['admin', 'user'])
      testUser(test, 'bob', ['editor'])
      testUser(test, 'joe', [])
    })

  Tinytest.add(
    'roles - can add user to roles multiple times', 
    function (test) {
      reset() 

      Roles.addUsersToRoles(users.eve, ['admin', 'user'])
      Roles.addUsersToRoles(users.eve, ['admin', 'user'])

      testUser(test, 'eve', ['admin', 'user'])
      testUser(test, 'bob', [])
      testUser(test, 'joe', [])

      Roles.addUsersToRoles(users.bob, ['admin'])
      Roles.addUsersToRoles(users.bob, ['editor'])

      testUser(test, 'eve', ['admin', 'user'])
      testUser(test, 'bob', ['admin', 'editor'])
      testUser(test, 'joe', [])
    })

  Tinytest.add(
    'roles - can add user to roles multiple times by group', 
    function (test) {
      reset() 

      Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'group1')
      Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'group1')

      testUser(test, 'eve', ['admin', 'user'], 'group1')
      testUser(test, 'bob', [], 'group1')
      testUser(test, 'joe', [], 'group1')

      Roles.addUsersToRoles(users.bob, ['admin'], 'group1')
      Roles.addUsersToRoles(users.bob, ['editor'], 'group1')

      testUser(test, 'eve', ['admin', 'user'], 'group1')
      testUser(test, 'bob', ['admin', 'editor'], 'group1')
      testUser(test, 'joe', [], 'group1')
    })

  Tinytest.add(
    'roles - can add multiple users to roles', 
    function (test) {
      reset() 

      Roles.addUsersToRoles([users.eve, users.bob], ['admin', 'user'])

      testUser(test, 'eve', ['admin', 'user'])
      testUser(test, 'bob', ['admin', 'user'])
      testUser(test, 'joe', [])

      Roles.addUsersToRoles([users.bob, users.joe], ['editor', 'user'])

      testUser(test, 'eve', ['admin', 'user'])
      testUser(test, 'bob', ['admin', 'editor', 'user'])
      testUser(test, 'joe', ['editor', 'user'])
    })

  Tinytest.add(
    'roles - can add multiple users to roles by group', 
    function (test) {
      reset() 

      Roles.addUsersToRoles([users.eve, users.bob], ['admin', 'user'], 'group1')

      testUser(test, 'eve', ['admin', 'user'], 'group1')
      testUser(test, 'bob', ['admin', 'user'], 'group1')
      testUser(test, 'joe', [], 'group1')

      testUser(test, 'eve', [], 'group2')
      testUser(test, 'bob', [], 'group2')
      testUser(test, 'joe', [], 'group2')

      Roles.addUsersToRoles([users.bob, users.joe], ['editor', 'user'], 'group1')
      Roles.addUsersToRoles([users.bob, users.joe], ['editor', 'user'], 'group2')

      testUser(test, 'eve', ['admin', 'user'], 'group1')
      testUser(test, 'bob', ['admin', 'editor', 'user'], 'group1')
      testUser(test, 'joe', ['editor', 'user'], 'group1')

      testUser(test, 'eve', [], 'group2')
      testUser(test, 'bob', ['editor', 'user'], 'group2')
      testUser(test, 'joe', ['editor', 'user'], 'group2')
    })

  Tinytest.add(
    'roles - can remove individual users from roles', 
    function (test) {
      reset() 

      // remove user role - one user
      Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'])
      testUser(test, 'eve', ['editor', 'user'])
      testUser(test, 'bob', ['editor', 'user'])
      Roles.removeUsersFromRoles(users.eve, ['user'])
      testUser(test, 'eve', ['editor'])
      testUser(test, 'bob', ['editor', 'user'])
    })
  Tinytest.add(
    'roles - can remove user from roles multiple times',
    function (test) {
      reset() 

      // remove user role - one user
      Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'])
      testUser(test, 'eve', ['editor', 'user'])
      testUser(test, 'bob', ['editor', 'user'])
      Roles.removeUsersFromRoles(users.eve, ['user'])
      testUser(test, 'eve', ['editor'])
      testUser(test, 'bob', ['editor', 'user'])

      // try remove again
      Roles.removeUsersFromRoles(users.eve, ['user'])
      testUser(test, 'eve', ['editor'])
    })

  Tinytest.add(
    'roles - can remove users from roles via user object', 
    function (test) {
      reset() 

      var eve = Meteor.users.findOne({_id: users.eve}),
          bob = Meteor.users.findOne({_id: users.bob})
    
      // remove user role - one user
      Roles.addUsersToRoles([eve, bob], ['editor', 'user'])
      testUser(test, 'eve', ['editor', 'user'])
      testUser(test, 'bob', ['editor', 'user'])
      Roles.removeUsersFromRoles(eve, ['user'])
      testUser(test, 'eve', ['editor'])
      testUser(test, 'bob', ['editor', 'user'])
    })


  Tinytest.add(
    'roles - can remove individual users from roles by group', 
    function (test) {
      reset() 

      // remove user role - one user
      Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'], 'group1')
      Roles.addUsersToRoles([users.joe, users.bob], ['admin'], 'group2')
      testUser(test, 'eve', ['editor', 'user'], 'group1')
      testUser(test, 'bob', ['editor', 'user'], 'group1')
      testUser(test, 'joe', [], 'group1')
      testUser(test, 'eve', [], 'group2')
      testUser(test, 'bob', ['admin'], 'group2')
      testUser(test, 'joe', ['admin'], 'group2')

      Roles.removeUsersFromRoles(users.eve, ['user'], 'group1')
      testUser(test, 'eve', ['editor'], 'group1')
      testUser(test, 'bob', ['editor', 'user'], 'group1')
      testUser(test, 'joe', [], 'group1')
      testUser(test, 'eve', [], 'group2')
      testUser(test, 'bob', ['admin'], 'group2')
      testUser(test, 'joe', ['admin'], 'group2')
    })

  Tinytest.add(
    'roles - can remove multiple users from roles', 
    function (test) {
      reset() 

      // remove user role - two users
      Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'])
      testUser(test, 'eve', ['editor', 'user'])
      testUser(test, 'bob', ['editor', 'user'])

      test.isFalse(Roles.userIsInRole(users.joe, 'admin'))
      Roles.addUsersToRoles([users.bob, users.joe], ['admin', 'user'])
      testUser(test, 'bob', ['admin', 'user', 'editor'])
      testUser(test, 'joe', ['admin', 'user'])
      Roles.removeUsersFromRoles([users.bob, users.joe], ['admin'])
      testUser(test, 'bob', ['user', 'editor'])
      testUser(test, 'joe', ['user'])
    })

  Tinytest.add(
    'roles - can remove multiple users from roles by group', 
    function (test) {
      reset() 

      // remove user role - one user
      Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'], 'group1')
      Roles.addUsersToRoles([users.joe, users.bob], ['admin'], 'group2')
      testUser(test, 'eve', ['editor', 'user'], 'group1')
      testUser(test, 'bob', ['editor', 'user'], 'group1')
      testUser(test, 'joe', [], 'group1')
      testUser(test, 'eve', [], 'group2')
      testUser(test, 'bob', ['admin'], 'group2')
      testUser(test, 'joe', ['admin'], 'group2')

      Roles.removeUsersFromRoles([users.eve, users.bob], ['user'], 'group1')
      testUser(test, 'eve', ['editor'], 'group1')
      testUser(test, 'bob', ['editor'], 'group1')
      testUser(test, 'joe', [], 'group1')
      testUser(test, 'eve', [], 'group2')
      testUser(test, 'bob', ['admin'], 'group2')
      testUser(test, 'joe', ['admin'], 'group2')

      Roles.removeUsersFromRoles([users.joe, users.bob], ['admin'], 'group2')
      testUser(test, 'eve', [], 'group2')
      testUser(test, 'bob', [], 'group2')
      testUser(test, 'joe', [], 'group2')
    })

  Tinytest.add(
    'roles - can set user roles', 
    function (test) {
      reset() 

      var eve = Meteor.users.findOne({_id: users.eve}),
          bob = Meteor.users.findOne({_id: users.bob}),
          joe = Meteor.users.findOne({_id: users.joe})
    
      Roles.setUserRoles([users.eve, bob], ['editor', 'user'])
      testUser(test, 'eve', ['editor', 'user'])
      testUser(test, 'bob', ['editor', 'user'])
      testUser(test, 'joe', [])

      // use addUsersToRoles add some roles
      Roles.addUsersToRoles([bob, users.joe], ['admin'])
      testUser(test, 'eve', ['editor', 'user'])
      testUser(test, 'bob', ['admin', 'editor', 'user'])
      testUser(test, 'joe', ['admin'])

      Roles.setUserRoles([eve, bob], ['user'])
      testUser(test, 'eve', ['user'])
      testUser(test, 'bob', ['user'])
      testUser(test, 'joe', ['admin'])

      Roles.setUserRoles(bob, 'editor')
      testUser(test, 'eve', ['user'])
      testUser(test, 'bob', ['editor'])
      testUser(test, 'joe', ['admin'])

      Roles.setUserRoles([users.joe, users.bob], [])
      testUser(test, 'eve', ['user'])
      testUser(test, 'bob', [])
      testUser(test, 'joe', [])
    })

  Tinytest.add(
    'roles - can set user roles by group', 
    function (test) {
      reset() 

      var eve = Meteor.users.findOne({_id: users.eve}),
          bob = Meteor.users.findOne({_id: users.bob}),
          joe = Meteor.users.findOne({_id: users.joe})
    
      Roles.setUserRoles([users.eve, users.bob], ['editor', 'user'], 'group1')
      Roles.setUserRoles([users.bob, users.joe], ['admin'], 'group2')
      testUser(test, 'eve', ['editor', 'user'], 'group1')
      testUser(test, 'bob', ['editor', 'user'], 'group1')
      testUser(test, 'joe', [], 'group1')
      testUser(test, 'eve', [], 'group2')
      testUser(test, 'bob', ['admin'], 'group2')
      testUser(test, 'joe', ['admin'], 'group2')

      // use addUsersToRoles add some roles
      Roles.addUsersToRoles([users.eve, users.bob], ['admin'], 'group1')
      Roles.addUsersToRoles([users.bob, users.joe], ['editor'], 'group2')
      testUser(test, 'eve', ['admin', 'editor', 'user'], 'group1')
      testUser(test, 'bob', ['admin', 'editor', 'user'], 'group1')
      testUser(test, 'joe', [], 'group1')
      testUser(test, 'eve', [], 'group2')
      testUser(test, 'bob', ['admin','editor'], 'group2')
      testUser(test, 'joe', ['admin','editor'], 'group2')

      Roles.setUserRoles([eve, bob], ['user'], 'group1')
      Roles.setUserRoles([eve, joe], ['editor'], 'group2')
      testUser(test, 'eve', ['user'], 'group1')
      testUser(test, 'bob', ['user'], 'group1')
      testUser(test, 'joe', [], 'group1')
      testUser(test, 'eve', ['editor'], 'group2')
      testUser(test, 'bob', ['admin','editor'], 'group2')
      testUser(test, 'joe', ['editor'], 'group2')

      Roles.setUserRoles(bob, 'editor', 'group1')
      testUser(test, 'eve', ['user'], 'group1')
      testUser(test, 'bob', ['editor'], 'group1')
      testUser(test, 'joe', [], 'group1')
      testUser(test, 'eve', ['editor'], 'group2')
      testUser(test, 'bob', ['admin','editor'], 'group2')
      testUser(test, 'joe', ['editor'], 'group2')

      Roles.setUserRoles([bob, users.joe], [], 'group1')
      testUser(test, 'eve', ['user'], 'group1')
      testUser(test, 'bob', [], 'group1')
      testUser(test, 'joe', [], 'group1')
      testUser(test, 'eve', ['editor'], 'group2')
      testUser(test, 'bob', ['admin','editor'], 'group2')
      testUser(test, 'joe', ['editor'], 'group2')
    })

  Tinytest.add(
    'roles - can set user roles by group including GLOBAL_GROUP', 
    function (test) {
      reset() 

      var eve = Meteor.users.findOne({_id: users.eve}),
          bob = Meteor.users.findOne({_id: users.bob}),
          joe = Meteor.users.findOne({_id: users.joe})
    
      Roles.addUsersToRoles(eve, 'admin', Roles.GLOBAL_GROUP)
      testUser(test, 'eve', ['admin'], 'group1')
      testUser(test, 'eve', ['admin'])

      Roles.setUserRoles(eve, 'editor', Roles.GLOBAL_GROUP)
      testUser(test, 'eve', ['editor'], 'group2')
      testUser(test, 'eve', ['editor'])
    })


  Tinytest.add(
    'roles - can get all roles', 
    function (test) {
      reset()
      _.each(roles, function (role) {
        Roles.createRole(role)
      })

      // compare roles, sorted alphabetically
      var expected = roles,
          actual = _.pluck(Roles.getAllRoles().fetch(), 'name')

      test.equal(actual, expected)
    })

  Tinytest.add(
    'roles - can\'t get roles for non-existant user', 
    function (test) {
      reset()
      test.equal(Roles.getRolesForUser('1'), [])
      test.equal(Roles.getRolesForUser('1', 'group1'), [])
    })

  Tinytest.add(
    'roles - can get all roles for user', 
    function (test) {
      reset()

      var userId = users.eve,
          userObj

      // by userId
      test.equal(Roles.getRolesForUser(userId), [])

      // by user object
      userObj = Meteor.users.findOne({_id: userId})
      test.equal(Roles.getRolesForUser(userObj), [])


      Roles.addUsersToRoles(userId, ['admin', 'user'])

      // by userId
      test.equal(Roles.getRolesForUser(userId), ['admin', 'user'])

      // by user object
      userObj = Meteor.users.findOne({_id: userId})
      test.equal(Roles.getRolesForUser(userObj), ['admin', 'user'])
    })

  Tinytest.add(
    'roles - can get all roles for user by group', 
    function (test) {
      reset()

      var userId = users.eve,
          userObj

      // by userId
      test.equal(Roles.getRolesForUser(userId, 'group1'), [])

      // by user object
      userObj = Meteor.users.findOne({_id: userId})
      test.equal(Roles.getRolesForUser(userObj, 'group1'), [])


      // add roles
      Roles.addUsersToRoles(userId, ['admin', 'user'], 'group1')

      // by userId
      test.equal(Roles.getRolesForUser(userId, 'group1'), ['admin', 'user'])
      test.equal(Roles.getRolesForUser(userId), [])

      // by user object
      userObj = Meteor.users.findOne({_id: userId})
      test.equal(Roles.getRolesForUser(userObj, 'group1'), ['admin', 'user'])
      test.equal(Roles.getRolesForUser(userObj), [])
    })

  Tinytest.add(
    'roles - can get all roles for user by group with periods in name', 
    function (test) {
      reset()

      Roles.addUsersToRoles(users.joe, ['admin'], 'example.k12.va.us')

      test.equal(Roles.getRolesForUser(users.joe, 'example.k12.va.us'), ['admin'])
    })

  Tinytest.add(
    'roles - can get all roles for user by group including Roles.GLOBAL_GROUP', 
    function (test) {
      reset()

      var userId = users.eve,
          userObj

      Roles.addUsersToRoles([users.eve], ['editor'], Roles.GLOBAL_GROUP)
      Roles.addUsersToRoles([users.eve], ['admin', 'user'], 'group1')

      // by userId
      test.equal(Roles.getRolesForUser(userId, 'group1'), ['admin', 'user', 'editor'])
      test.equal(Roles.getRolesForUser(userId), ['editor'])

      // by user object
      userObj = Meteor.users.findOne({_id: userId})
      test.equal(Roles.getRolesForUser(userObj, 'group1'), ['admin', 'user', 'editor'])
      test.equal(Roles.getRolesForUser(userObj), ['editor'])
    })


  Tinytest.add(
    'roles - getRolesForUser should not return null entries if user has no roles for group', 
    function (test) {
      reset()

      var userId = users.eve,
          userObj

      // by userId
      test.equal(Roles.getRolesForUser(userId, 'group1'), [])
      test.equal(Roles.getRolesForUser(userId), [])

      // by user object
      userObj = Meteor.users.findOne({_id: userId})
      test.equal(Roles.getRolesForUser(userObj, 'group1'), [])
      test.equal(Roles.getRolesForUser(userObj), [])


      Roles.addUsersToRoles([users.eve], ['editor'], Roles.GLOBAL_GROUP)

      // by userId
      test.equal(Roles.getRolesForUser(userId, 'group1'), ['editor'])
      test.equal(Roles.getRolesForUser(userId), ['editor'])

      // by user object
      userObj = Meteor.users.findOne({_id: userId})
      test.equal(Roles.getRolesForUser(userObj, 'group1'), ['editor'])
      test.equal(Roles.getRolesForUser(userObj), ['editor'])
    })
    
  Tinytest.add(
    'roles - can get all groups for user', 
    function (test) {
      reset()

    var userId = users.eve,
        userObj

    Roles.addUsersToRoles([users.eve], ['editor'], 'group1')
    Roles.addUsersToRoles([users.eve], ['admin', 'user'], 'group2')

    // by userId
    test.equal(Roles.getGroupsForUser(userId), ['group1', 'group2'])

    // by user object
    userObj = Meteor.users.findOne({_id: userId})
    test.equal(Roles.getGroupsForUser(userObj), ['group1', 'group2'])
  })
  
  Tinytest.add(
    'roles - can get all groups for user by role', 
    function (test) {
      reset()

    var userId = users.eve,
        userObj

    Roles.addUsersToRoles([users.eve], ['editor'], 'group1')
    Roles.addUsersToRoles([users.eve], ['editor', 'user'], 'group2')

    // by userId
    test.equal(Roles.getGroupsForUser(userId, 'user'), ['group2'])
    test.equal(Roles.getGroupsForUser(userId, 'editor'), ['group1', 'group2'])
    test.equal(Roles.getGroupsForUser(userId, 'admin'), [])

    // by user object
    userObj = Meteor.users.findOne({_id: userId})
    test.equal(Roles.getGroupsForUser(userObj, 'user'), ['group2'])
    test.equal(Roles.getGroupsForUser(userObj, 'editor'), ['group1', 'group2'])
    test.equal(Roles.getGroupsForUser(userObj, 'admin'), [])
  })
  
  Tinytest.add(
    'roles - getGroupsForUser returns [] when not using groups', 
    function (test) {
      reset()

    var userId = users.eve,
        userObj

    Roles.addUsersToRoles([users.eve], ['editor', 'user'])

    // by userId
    test.equal(Roles.getGroupsForUser(userId), [])
    test.equal(Roles.getGroupsForUser(userId, 'editor'), [])

    // by user object
    userObj = Meteor.users.findOne({_id: userId})
    test.equal(Roles.getGroupsForUser(userObj), [])
    test.equal(Roles.getGroupsForUser(userObj, 'editor'), [])
  })
  
  
  Tinytest.add(
    'roles - getting all groups for user does not include GLOBAL_GROUP', 
    function (test) {
      reset()

    var userId = users.eve,
        userObj

    Roles.addUsersToRoles([users.eve], ['editor'], 'group1')
    Roles.addUsersToRoles([users.eve], ['editor', 'user'], 'group2')
    Roles.addUsersToRoles([users.eve], ['editor', 'user', 'admin'], Roles.GLOBAL_GROUP)

    // by userId
    test.equal(Roles.getGroupsForUser(userId, 'user'), ['group2'])
    test.equal(Roles.getGroupsForUser(userId, 'editor'), ['group1', 'group2'])
    test.equal(Roles.getGroupsForUser(userId, 'admin'), [])

    // by user object
    userObj = Meteor.users.findOne({_id: userId})
    test.equal(Roles.getGroupsForUser(userObj, 'user'), ['group2'])
    test.equal(Roles.getGroupsForUser(userObj, 'editor'), ['group1', 'group2'])
    test.equal(Roles.getGroupsForUser(userObj, 'admin'), [])
  })


  Tinytest.add(
    'roles - can get all users in role', 
    function (test) {
      reset()
      _.each(roles, function (role) {
        Roles.createRole(role)
      })

      Roles.addUsersToRoles([users.eve, users.joe], ['admin', 'user'])
      Roles.addUsersToRoles([users.bob, users.joe], ['editor'])

      var expected = [users.eve, users.joe],
          actual = _.pluck(Roles.getUsersInRole('admin').fetch(), '_id')

      // order may be different so check difference instead of equality
      // difference uses first array as base so have to check both ways
      test.equal(_.difference(actual, expected), [])
      test.equal(_.difference(expected, actual), [])
    })

  Tinytest.add(
    'roles - can get all users in role by group', 
    function (test) {
      reset()
      Roles.addUsersToRoles([users.eve, users.joe], ['admin', 'user'], 'group1')
      Roles.addUsersToRoles([users.bob, users.joe], ['admin'], 'group2')

      var expected = [users.eve, users.joe],
          actual = _.pluck(Roles.getUsersInRole('admin','group1').fetch(), '_id')

      // order may be different so check difference instead of equality
      // difference uses first array as base so have to check both ways
      test.equal(_.difference(actual, expected), [])
      test.equal(_.difference(expected, actual), [])
    })
  
  Tinytest.add(
    'roles - can get all users in role by group including Roles.GLOBAL_GROUP', 
    function (test) {
      reset()
      Roles.addUsersToRoles([users.eve], ['admin', 'user'], Roles.GLOBAL_GROUP)
      Roles.addUsersToRoles([users.bob, users.joe], ['admin'], 'group2')

      var expected = [users.eve],
          actual = _.pluck(Roles.getUsersInRole('admin','group1').fetch(), '_id')

      // order may be different so check difference instead of equality
      // difference uses first array as base so have to check both ways
      test.equal(_.difference(actual, expected), [])
      test.equal(_.difference(expected, actual), [])

      expected = [users.eve, users.bob, users.joe]
      actual = _.pluck(Roles.getUsersInRole('admin','group2').fetch(), '_id')

      // order may be different so check difference instead of equality
      test.equal(_.difference(actual, expected), [])
      test.equal(_.difference(expected, actual), [])


      expected = [users.eve]
      actual = _.pluck(Roles.getUsersInRole('admin').fetch(), '_id')

      // order may be different so check difference instead of equality
      test.equal(_.difference(actual, expected), [])
      test.equal(_.difference(expected, actual), [])
    })


  Tinytest.add(
    'roles - can use Roles.GLOBAL_GROUP to assign blanket permissions',
    function (test) {
      reset()

      Roles.addUsersToRoles([users.joe, users.bob], ['admin'], Roles.GLOBAL_GROUP)

      testUser(test, 'eve', [], 'group1')
      testUser(test, 'joe', ['admin'], 'group2')
      testUser(test, 'joe', ['admin'], 'group1')
      testUser(test, 'bob', ['admin'], 'group2')
      testUser(test, 'bob', ['admin'], 'group1')

      Roles.removeUsersFromRoles(users.joe, ['admin'], Roles.GLOBAL_GROUP)

      testUser(test, 'eve', [], 'group1')
      testUser(test, 'joe', [], 'group2')
      testUser(test, 'joe', [], 'group1')
      testUser(test, 'bob', ['admin'], 'group2')
      testUser(test, 'bob', ['admin'], 'group1')
    })

  Tinytest.add(
    'roles - Roles.GLOBAL_GROUP is independent of other groups',
    function (test) {
      reset()

      Roles.addUsersToRoles([users.joe, users.bob], ['admin'], 'group5')
      Roles.addUsersToRoles([users.joe, users.bob], ['admin'], Roles.GLOBAL_GROUP)

      testUser(test, 'eve', [], 'group1')
      testUser(test, 'joe', ['admin'], 'group5')
      testUser(test, 'joe', ['admin'], 'group2')
      testUser(test, 'joe', ['admin'], 'group1')
      testUser(test, 'bob', ['admin'], 'group5')
      testUser(test, 'bob', ['admin'], 'group2')
      testUser(test, 'bob', ['admin'], 'group1')

      Roles.removeUsersFromRoles(users.joe, ['admin'], Roles.GLOBAL_GROUP)

      testUser(test, 'eve', [], 'group1')
      testUser(test, 'joe', ['admin'], 'group5')
      testUser(test, 'joe', [], 'group2')
      testUser(test, 'joe', [], 'group1')
      testUser(test, 'bob', ['admin'], 'group5')
      testUser(test, 'bob', ['admin'], 'group2')
      testUser(test, 'bob', ['admin'], 'group1')
    })
  
  Tinytest.add(
    'roles - Roles.GLOBAL_GROUP also checked when group not specified',
    function (test) {
      reset()

      Roles.addUsersToRoles(users.joe, 'admin', Roles.GLOBAL_GROUP)

      testUser(test, 'joe', ['admin'])

      Roles.removeUsersFromRoles(users.joe, 'admin', Roles.GLOBAL_GROUP)

      testUser(test, 'joe', [])
    })

  Tinytest.add(
    'roles - mixing group with non-group throws descriptive error', 
    function (test) {
      var expectedErrorMsg = "Roles error: Can't mix grouped and non-grouped roles for same user"

      reset() 
      Roles.addUsersToRoles(users.joe, ['editor', 'user'], 'group1')
      try {
        Roles.addUsersToRoles(users.joe, ['admin'])
        throw new Error("expected exception but didn't get one")
      } 
      catch (ex) {
        test.isTrue(ex.message == expectedErrorMsg, ex.message)
      }

      reset() 
      Roles.addUsersToRoles(users.bob, ['editor', 'user'])
      try {
        Roles.addUsersToRoles(users.bob, ['admin'], 'group2')
        throw new Error("expected exception but didn't get one")
      }
      catch (ex) {
        test.isTrue(ex.message == expectedErrorMsg, ex.message)
      }

      reset() 
      Roles.addUsersToRoles(users.bob, ['editor', 'user'], 'group1')
      try {
        Roles.removeUsersFromRoles(users.bob, ['user'])
        throw new Error("expected exception but didn't get one")
      }
      catch (ex) {
        test.isTrue(ex.message == expectedErrorMsg, ex.message)
      }

      reset() 
      Roles.addUsersToRoles(users.bob, ['editor', 'user'])
      try {
        Roles.setUserRoles(users.bob, ['user'], 'group1')
        throw new Error("expected exception but didn't get one")
      }
      catch (ex) {
        test.isTrue(ex.message == expectedErrorMsg, ex.message)
      }

      reset() 
      Roles.addUsersToRoles(users.bob, ['editor', 'user'])
      // don't expect this to throw error
      Roles.removeUsersFromRoles(users.bob, ['user'], 'group1')

      reset() 
      Roles.addUsersToRoles(users.bob, ['editor', 'user'], 'group1')
      // this is probably not a good idea but shouldn't throw...
      Roles.setUserRoles(users.bob, ['user'])
    })

  Tinytest.add(
    "roles - can use '.' in group name",
    function (test) {
      reset() 

      Roles.addUsersToRoles(users.joe, ['admin'], 'example.com')
      testUser(test, 'joe', ['admin'], 'example.com')
    })

  Tinytest.add(
    "roles - can use multiple periods in group name",
    function (test) {
      reset() 

      Roles.addUsersToRoles(users.joe, ['admin'], 'example.k12.va.us')
      testUser(test, 'joe', ['admin'], 'example.k12.va.us')
    })

  Tinytest.add(
    'roles - invalid group name throws descriptive error', 
    function (test) {
      var expectedErrorMsg = "Roles error: groups can not start with '$'"

      reset() 
      try {
        Roles.addUsersToRoles(users.joe, ['admin'], '$group1')
        throw new Error("expected exception but didn't get one")
      } 
      catch (ex) {
        test.isTrue(ex.message == expectedErrorMsg, ex.message)
      }

      reset() 
      // should not throw error
      Roles.addUsersToRoles(users.bob, ['editor', 'user'], 'g$roup1')
    })

  function printException (ex) {
    var tmp = {}
    for (var key in ex) {
      if (key != 'stack') {
        tmp[key] = ex[key]
      }
    }
    console.log(JSON.stringify(tmp));
  }

}());
