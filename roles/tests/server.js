;(function () {

  var users = {},
      roles = ['admin','editor','user'];

  // use to run individual tests
  //Tinytest.oadd = Tinytest.add
  //Tinytest.add = function () {}

  function addUser (name) {
    return Accounts.createUser({'username': name});
  }

  function reset () {
    Meteor.roles.remove({});
    Meteor.users.remove({});

    users = {
      'eve': addUser('eve'),
      'bob': addUser('bob'),
      'joe': addUser('joe')
    };
  }


  function testUser (test, username, expectedRoles, partition) {
    var userId = users[username],
        userObj = Meteor.users.findOne({_id: userId});
        
    // check using user ids (makes db calls)
    _innerTest(test, userId, username, expectedRoles, partition);

    // check using passed-in user object
    _innerTest(test, userObj, username, expectedRoles, partition);
  }

  function _innerTest (test, userParam, username, expectedRoles, partition) {
    // test that user has only the roles expected and no others
    _.each(roles, function (role) {
      var expected = _.contains(expectedRoles, role),
          msg = username + ' expected to have \'' + role + '\' role but does not',
          nmsg = username + ' had the following un-expected role: ' + role;

      if (expected) {
        test.isTrue(Roles.userIsInRole(userParam, role, partition), msg);
      } else {
        test.isFalse(Roles.userIsInRole(userParam, role, partition), nmsg);
      }
    })
  }

  function itemsEqual (test, actual, expected) {
    actual = actual || [];
    expected = expected || [];

    function intersectionObjects(/*args*/) {
      var array, rest;
      array = arguments[0];
      rest = 2 <= arguments.length ? _.toArray(arguments).slice(1) : [];
      return _.filter(_.uniq(array), function (item) {
        return _.every(rest, function (other) {
          return _.any(other, function (element) {
            return _.isEqual(element, item);
          });
        });
      });
    }

    if (actual.length === expected.length && intersectionObjects(actual, expected).length === actual.length) {
      test.ok();
    }
    else {
      test.fail({
        type: 'itemsEqual',
        actual: JSON.stringify(actual),
        expected: JSON.stringify(expected)
      });
    }
  }

  Tinytest.add(
    'roles - can create and delete roles', 
    function (test) {
      reset();

      var role1Id = Roles.createRole('test1');
      test.equal(Meteor.roles.findOne()._id, 'test1');
      test.equal(Meteor.roles.findOne(role1Id)._id, 'test1');

      var role2Id = Roles.createRole('test2');
      test.equal(Meteor.roles.findOne({_id: 'test2'})._id, 'test2');
      test.equal(Meteor.roles.findOne(role2Id)._id, 'test2');

      test.equal(Meteor.roles.find().count(), 2);

      Roles.deleteRole('test1');
      test.equal(typeof Meteor.roles.findOne({_id: 'test1'}), 'undefined');

      Roles.deleteRole('test2');
      test.equal(typeof Meteor.roles.findOne(), 'undefined');
    });

  Tinytest.add(
    'roles - can\'t create duplicate roles', 
    function (test) {
      reset();

      Roles.createRole('test1');
      test.throws(function () {Roles.createRole('test1')});
      test.isNull(Roles.createRole('test1', {unlessExists: true}));
    });

  Tinytest.add(
    'roles - can\'t create role with empty names', 
    function (test) {
      reset();

      test.throws(function () {
        Roles.createRole('');
      }, /Invalid role name/);
      test.throws(function () {
        Roles.createRole(null);
      }, /Invalid role name/);
      test.throws(function () {
        Roles.createRole(' ');
      }, /Invalid role name/);
      test.throws(function () {
        Roles.createRole(' foobar');
      }, /Invalid role name/);
      test.throws(function () {
        Roles.createRole(' foobar ');
      }, /Invalid role name/);
    });

  Tinytest.add(
    'roles - can\'t use invalid partition names',
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');
      Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'partition1');
      Roles.addUsersToRoles(users.eve, ['editor'], 'partition2');

      test.throws(function () {
        Roles.addUsersToRoles(users.eve, ['admin', 'user'], ' ');
      }, /Invalid partition name/);
      test.throws(function () {
        Roles.addUsersToRoles(users.eve, ['admin', 'user'], ' foobar');
      }, /Invalid partition name/);
      test.throws(function () {
        Roles.addUsersToRoles(users.eve, ['admin', 'user'], ' foobar ');
      }, /Invalid partition name/);
      test.throws(function () {
        Roles.addUsersToRoles(users.eve, ['admin', 'user'], 42);
      }, /Invalid partition name/);
    });

  Tinytest.add(
    'roles - can check if user is in role', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.addUsersToRoles(users.eve, ['admin', 'user']);

      testUser(test, 'eve', ['admin', 'user']);
    });

  Tinytest.add(
    'roles - can check if user is in role by partition', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');
      Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'partition1');
      Roles.addUsersToRoles(users.eve, ['editor'], 'partition2');

      testUser(test, 'eve', ['admin', 'user'], 'partition1');
      testUser(test, 'eve', ['editor'], 'partition2');

      test.isFalse(Roles.userIsInRole(users.eve, ['admin', 'user'], 'partition2'));
      test.isFalse(Roles.userIsInRole(users.eve, ['editor'], 'partition1'));

      test.isTrue(Roles.userIsInRole(users.eve, ['admin', 'user'], {anyPartition: true}));
      test.isTrue(Roles.userIsInRole(users.eve, ['editor'], {anyPartition: true}));
    });

  Tinytest.add(
    'roles - can check if user is in role by partition through options',
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');
      Roles.addUsersToRoles(users.eve, ['admin', 'user'], {partition: 'partition1'});
      Roles.addUsersToRoles(users.eve, ['editor'], {partition: 'partition2'});

      testUser(test, 'eve', ['admin', 'user'], {partition: 'partition1'});
      testUser(test, 'eve', ['editor'], {partition: 'partition2'});
    });

  Tinytest.add(
    'roles - can check if user is in role by partition with global role',
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');
      Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'partition1');
      Roles.addUsersToRoles(users.eve, ['editor'], 'partition2');
      Roles.addUsersToRoles(users.eve, ['admin']);

      test.isTrue(Roles.userIsInRole(users.eve, ['user'], 'partition1'));
      test.isTrue(Roles.userIsInRole(users.eve, ['editor'], 'partition2'));

      test.isFalse(Roles.userIsInRole(users.eve, ['user']));
      test.isFalse(Roles.userIsInRole(users.eve, ['editor']));

      test.isFalse(Roles.userIsInRole(users.eve, ['user'], 'partition2'));
      test.isFalse(Roles.userIsInRole(users.eve, ['editor'], 'partition1'));

      test.isTrue(Roles.userIsInRole(users.eve, ['admin'], 'partition2'));
      test.isTrue(Roles.userIsInRole(users.eve, ['admin'], 'partition1'));
      test.isTrue(Roles.userIsInRole(users.eve, ['admin']));
    });

  Tinytest.add(
    'roles - can check if non-existant user is in role', 
    function (test) {
      reset();

      test.isFalse(Roles.userIsInRole('1', 'admin'));
    });

  Tinytest.add(
    'roles - can check if null user is in role', 
    function (test) {
      var user = null;
      reset();
      
      test.isFalse(Roles.userIsInRole(user, 'admin'));
    });

  Tinytest.add(
    'roles - can check user against several roles at once', 
    function (test) {
      var user;
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');

      Roles.addUsersToRoles(users.eve, ['admin', 'user']);
      user = Meteor.users.findOne({_id:users.eve});

      // we can check the non-existing role
      test.isTrue(Roles.userIsInRole(user, ['editor', 'admin']));
    });

  Tinytest.add(
    'roles - can\'t add non-existent user to role', 
    function (test) {
      reset();

      Roles.createRole('admin');

      Roles.addUsersToRoles(['1'], ['admin']);
      test.equal(Meteor.users.findOne({_id:'1'}), undefined);
    });

  Tinytest.add(
    'roles - can\'t add user to non-existent role',
    function (test) {
      reset();

      test.throws(function () {
        Roles.addUsersToRoles(users.eve, ['admin']);
      }, /Role 'admin' does not exist/);
      Roles.addUsersToRoles(users.eve, ['admin'], {ifExists: true});
    });

  Tinytest.add(
    'roles - can\'t set non-existent user to role',
    function (test) {
      reset();

      Roles.createRole('admin');

      Roles.setUserRoles(['1'], ['admin']);
      test.equal(Meteor.users.findOne({_id:'1'}), undefined);
    });

  Tinytest.add(
    'roles - can\'t set user to non-existent role',
    function (test) {
      reset();

      test.throws(function () {
        Roles.setUserRoles(users.eve, ['admin']);
      }, /Role 'admin' does not exist/);
      Roles.setUserRoles(users.eve, ['admin'], {ifExists: true});
    });

  Tinytest.add(
    'roles - can add individual users to roles', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      Roles.addUsersToRoles(users.eve, ['admin', 'user']);

      testUser(test, 'eve', ['admin', 'user']);
      testUser(test, 'bob', []);
      testUser(test, 'joe', []);

      Roles.addUsersToRoles(users.joe, ['editor', 'user']);

      testUser(test, 'eve', ['admin', 'user']);
      testUser(test, 'bob', []);
      testUser(test, 'joe', ['editor', 'user']);
    });

  Tinytest.add(
    'roles - can add individual users to roles by partition', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'partition1');

      testUser(test, 'eve', ['admin', 'user'], 'partition1');
      testUser(test, 'bob', [], 'partition1');
      testUser(test, 'joe', [], 'partition1');

      testUser(test, 'eve', [], 'partition2');
      testUser(test, 'bob', [], 'partition2');
      testUser(test, 'joe', [], 'partition2');

      Roles.addUsersToRoles(users.joe, ['editor', 'user'], 'partition1');
      Roles.addUsersToRoles(users.bob, ['editor', 'user'], 'partition2');

      testUser(test, 'eve', ['admin', 'user'], 'partition1');
      testUser(test, 'bob', [], 'partition1');
      testUser(test, 'joe', ['editor', 'user'], 'partition1');

      testUser(test, 'eve', [], 'partition2');
      testUser(test, 'bob', ['editor', 'user'], 'partition2');
      testUser(test, 'joe', [], 'partition2');
    });

  Tinytest.add(
    'roles - can add user to roles via user object', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      var eve = Meteor.users.findOne({_id: users.eve}),
          bob = Meteor.users.findOne({_id: users.bob});

      Roles.addUsersToRoles(eve, ['admin', 'user']);

      testUser(test, 'eve', ['admin', 'user']);
      testUser(test, 'bob', []);
      testUser(test, 'joe', []);

      Roles.addUsersToRoles(bob, ['editor']);

      testUser(test, 'eve', ['admin', 'user']);
      testUser(test, 'bob', ['editor']);
      testUser(test, 'joe', []);
    });

  Tinytest.add(
    'roles - can add user to roles multiple times', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      Roles.addUsersToRoles(users.eve, ['admin', 'user']);
      Roles.addUsersToRoles(users.eve, ['admin', 'user']);

      testUser(test, 'eve', ['admin', 'user']);
      testUser(test, 'bob', []);
      testUser(test, 'joe', []);

      Roles.addUsersToRoles(users.bob, ['admin']);
      Roles.addUsersToRoles(users.bob, ['editor']);

      testUser(test, 'eve', ['admin', 'user']);
      testUser(test, 'bob', ['admin', 'editor']);
      testUser(test, 'joe', []);
    });

  Tinytest.add(
    'roles - can add user to roles multiple times by partition', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'partition1');
      Roles.addUsersToRoles(users.eve, ['admin', 'user'], 'partition1');

      testUser(test, 'eve', ['admin', 'user'], 'partition1');
      testUser(test, 'bob', [], 'partition1');
      testUser(test, 'joe', [], 'partition1');

      Roles.addUsersToRoles(users.bob, ['admin'], 'partition1');
      Roles.addUsersToRoles(users.bob, ['editor'], 'partition1');

      testUser(test, 'eve', ['admin', 'user'], 'partition1');
      testUser(test, 'bob', ['admin', 'editor'], 'partition1');
      testUser(test, 'joe', [], 'partition1');
    });

  Tinytest.add(
    'roles - can add multiple users to roles', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      Roles.addUsersToRoles([users.eve, users.bob], ['admin', 'user']);

      testUser(test, 'eve', ['admin', 'user']);
      testUser(test, 'bob', ['admin', 'user']);
      testUser(test, 'joe', []);

      Roles.addUsersToRoles([users.bob, users.joe], ['editor', 'user']);

      testUser(test, 'eve', ['admin', 'user']);
      testUser(test, 'bob', ['admin', 'editor', 'user']);
      testUser(test, 'joe', ['editor', 'user']);
    });

  Tinytest.add(
    'roles - can add multiple users to roles by partition', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      Roles.addUsersToRoles([users.eve, users.bob], ['admin', 'user'], 'partition1');

      testUser(test, 'eve', ['admin', 'user'], 'partition1');
      testUser(test, 'bob', ['admin', 'user'], 'partition1');
      testUser(test, 'joe', [], 'partition1');

      testUser(test, 'eve', [], 'partition2');
      testUser(test, 'bob', [], 'partition2');
      testUser(test, 'joe', [], 'partition2');

      Roles.addUsersToRoles([users.bob, users.joe], ['editor', 'user'], 'partition1');
      Roles.addUsersToRoles([users.bob, users.joe], ['editor', 'user'], 'partition2');

      testUser(test, 'eve', ['admin', 'user'], 'partition1');
      testUser(test, 'bob', ['admin', 'editor', 'user'], 'partition1');
      testUser(test, 'joe', ['editor', 'user'], 'partition1');

      testUser(test, 'eve', [], 'partition2');
      testUser(test, 'bob', ['editor', 'user'], 'partition2');
      testUser(test, 'joe', ['editor', 'user'], 'partition2');
    });

  Tinytest.add(
    'roles - can remove individual users from roles', 
    function (test) {
      reset();

      Roles.createRole('user');
      Roles.createRole('editor');

      // remove user role - one user
      Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user']);
      testUser(test, 'eve', ['editor', 'user']);
      testUser(test, 'bob', ['editor', 'user']);
      Roles.removeUsersFromRoles(users.eve, ['user']);
      testUser(test, 'eve', ['editor']);
      testUser(test, 'bob', ['editor', 'user']);
    });

  Tinytest.add(
    'roles - can remove user from roles multiple times',
    function (test) {
      reset();

      Roles.createRole('user');
      Roles.createRole('editor');

      // remove user role - one user
      Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user']);
      testUser(test, 'eve', ['editor', 'user']);
      testUser(test, 'bob', ['editor', 'user']);
      Roles.removeUsersFromRoles(users.eve, ['user']);
      testUser(test, 'eve', ['editor']);
      testUser(test, 'bob', ['editor', 'user']);

      // try remove again
      Roles.removeUsersFromRoles(users.eve, ['user']);
      testUser(test, 'eve', ['editor']);
    });

  Tinytest.add(
    'roles - can remove users from roles via user object', 
    function (test) {
      reset();

      Roles.createRole('user');
      Roles.createRole('editor');

      var eve = Meteor.users.findOne({_id: users.eve}),
          bob = Meteor.users.findOne({_id: users.bob});
    
      // remove user role - one user
      Roles.addUsersToRoles([eve, bob], ['editor', 'user']);
      testUser(test, 'eve', ['editor', 'user']);
      testUser(test, 'bob', ['editor', 'user']);
      Roles.removeUsersFromRoles(eve, ['user']);
      testUser(test, 'eve', ['editor']);
      testUser(test, 'bob', ['editor', 'user']);
    });

  Tinytest.add(
    'roles - can remove individual users from roles by partition', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      // remove user role - one user
      Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'], 'partition1');
      Roles.addUsersToRoles([users.joe, users.bob], ['admin'], 'partition2');
      testUser(test, 'eve', ['editor', 'user'], 'partition1');
      testUser(test, 'bob', ['editor', 'user'], 'partition1');
      testUser(test, 'joe', [], 'partition1');
      testUser(test, 'eve', [], 'partition2');
      testUser(test, 'bob', ['admin'], 'partition2');
      testUser(test, 'joe', ['admin'], 'partition2');

      Roles.removeUsersFromRoles(users.eve, ['user'], 'partition1');
      testUser(test, 'eve', ['editor'], 'partition1');
      testUser(test, 'bob', ['editor', 'user'], 'partition1');
      testUser(test, 'joe', [], 'partition1');
      testUser(test, 'eve', [], 'partition2');
      testUser(test, 'bob', ['admin'], 'partition2');
      testUser(test, 'joe', ['admin'], 'partition2');
    });

  Tinytest.add(
    'roles - can remove individual users from roles by partition through options',
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      // remove user role - one user
      Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'], {partition: 'partition1'});
      Roles.addUsersToRoles([users.joe, users.bob], ['admin'], {partition: 'partition2'});
      testUser(test, 'eve', ['editor', 'user'], 'partition1');
      testUser(test, 'bob', ['editor', 'user'], 'partition1');
      testUser(test, 'joe', [], 'partition1');
      testUser(test, 'eve', [], 'partition2');
      testUser(test, 'bob', ['admin'], 'partition2');
      testUser(test, 'joe', ['admin'], 'partition2');

      Roles.removeUsersFromRoles(users.eve, ['user'], {partition: 'partition1'});
      testUser(test, 'eve', ['editor'], 'partition1');
      testUser(test, 'bob', ['editor', 'user'], 'partition1');
      testUser(test, 'joe', [], 'partition1');
      testUser(test, 'eve', [], 'partition2');
      testUser(test, 'bob', ['admin'], 'partition2');
      testUser(test, 'joe', ['admin'], 'partition2');
    });

  Tinytest.add(
    'roles - can remove multiple users from roles', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      // remove user role - two users
      Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user']);
      testUser(test, 'eve', ['editor', 'user']);
      testUser(test, 'bob', ['editor', 'user']);

      test.isFalse(Roles.userIsInRole(users.joe, 'admin'));
      Roles.addUsersToRoles([users.bob, users.joe], ['admin', 'user']);
      testUser(test, 'bob', ['admin', 'user', 'editor']);
      testUser(test, 'joe', ['admin', 'user']);
      Roles.removeUsersFromRoles([users.bob, users.joe], ['admin']);
      testUser(test, 'bob', ['user', 'editor']);
      testUser(test, 'joe', ['user']);
    });

  Tinytest.add(
    'roles - can remove multiple users from roles by partition', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      // remove user role - one user
      Roles.addUsersToRoles([users.eve, users.bob], ['editor', 'user'], 'partition1');
      Roles.addUsersToRoles([users.joe, users.bob], ['admin'], 'partition2');
      testUser(test, 'eve', ['editor', 'user'], 'partition1');
      testUser(test, 'bob', ['editor', 'user'], 'partition1');
      testUser(test, 'joe', [], 'partition1');
      testUser(test, 'eve', [], 'partition2');
      testUser(test, 'bob', ['admin'], 'partition2');
      testUser(test, 'joe', ['admin'], 'partition2');

      Roles.removeUsersFromRoles([users.eve, users.bob], ['user'], 'partition1');
      testUser(test, 'eve', ['editor'], 'partition1');
      testUser(test, 'bob', ['editor'], 'partition1');
      testUser(test, 'joe', [], 'partition1');
      testUser(test, 'eve', [], 'partition2');
      testUser(test, 'bob', ['admin'], 'partition2');
      testUser(test, 'joe', ['admin'], 'partition2');

      Roles.removeUsersFromRoles([users.joe, users.bob], ['admin'], 'partition2');
      testUser(test, 'eve', [], 'partition2');
      testUser(test, 'bob', [], 'partition2');
      testUser(test, 'joe', [], 'partition2');
    });

  Tinytest.add(
    'roles - can set user roles', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      var eve = Meteor.users.findOne({_id: users.eve}),
          bob = Meteor.users.findOne({_id: users.bob}),
          joe = Meteor.users.findOne({_id: users.joe});
    
      Roles.setUserRoles([users.eve, bob], ['editor', 'user']);
      testUser(test, 'eve', ['editor', 'user']);
      testUser(test, 'bob', ['editor', 'user']);
      testUser(test, 'joe', []);

      // use addUsersToRoles add some roles
      Roles.addUsersToRoles([bob, users.joe], ['admin']);
      testUser(test, 'eve', ['editor', 'user']);
      testUser(test, 'bob', ['admin', 'editor', 'user']);
      testUser(test, 'joe', ['admin']);

      Roles.setUserRoles([eve, bob], ['user']);
      testUser(test, 'eve', ['user']);
      testUser(test, 'bob', ['user']);
      testUser(test, 'joe', ['admin']);

      Roles.setUserRoles(bob, 'editor');
      testUser(test, 'eve', ['user']);
      testUser(test, 'bob', ['editor']);
      testUser(test, 'joe', ['admin']);

      Roles.setUserRoles([users.joe, users.bob], []);
      testUser(test, 'eve', ['user']);
      testUser(test, 'bob', []);
      testUser(test, 'joe', []);
    });

  Tinytest.add(
    'roles - can set user roles by partition', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      var eve = Meteor.users.findOne({_id: users.eve}),
          bob = Meteor.users.findOne({_id: users.bob}),
          joe = Meteor.users.findOne({_id: users.joe});
    
      Roles.setUserRoles([users.eve, users.bob], ['editor', 'user'], 'partition1');
      Roles.setUserRoles([users.bob, users.joe], ['admin'], 'partition2');
      testUser(test, 'eve', ['editor', 'user'], 'partition1');
      testUser(test, 'bob', ['editor', 'user'], 'partition1');
      testUser(test, 'joe', [], 'partition1');
      testUser(test, 'eve', [], 'partition2');
      testUser(test, 'bob', ['admin'], 'partition2');
      testUser(test, 'joe', ['admin'], 'partition2');

      // use addUsersToRoles add some roles
      Roles.addUsersToRoles([users.eve, users.bob], ['admin'], 'partition1');
      Roles.addUsersToRoles([users.bob, users.joe], ['editor'], 'partition2');
      testUser(test, 'eve', ['admin', 'editor', 'user'], 'partition1');
      testUser(test, 'bob', ['admin', 'editor', 'user'], 'partition1');
      testUser(test, 'joe', [], 'partition1');
      testUser(test, 'eve', [], 'partition2');
      testUser(test, 'bob', ['admin','editor'], 'partition2');
      testUser(test, 'joe', ['admin','editor'], 'partition2');

      Roles.setUserRoles([eve, bob], ['user'], 'partition1');
      Roles.setUserRoles([eve, joe], ['editor'], 'partition2');
      testUser(test, 'eve', ['user'], 'partition1');
      testUser(test, 'bob', ['user'], 'partition1');
      testUser(test, 'joe', [], 'partition1');
      testUser(test, 'eve', ['editor'], 'partition2');
      testUser(test, 'bob', ['admin','editor'], 'partition2');
      testUser(test, 'joe', ['editor'], 'partition2');

      Roles.setUserRoles(bob, 'editor', 'partition1');
      testUser(test, 'eve', ['user'], 'partition1');
      testUser(test, 'bob', ['editor'], 'partition1');
      testUser(test, 'joe', [], 'partition1');
      testUser(test, 'eve', ['editor'], 'partition2');
      testUser(test, 'bob', ['admin','editor'], 'partition2');
      testUser(test, 'joe', ['editor'], 'partition2');

      Roles.setUserRoles([bob, users.joe], [], 'partition1');
      testUser(test, 'eve', ['user'], 'partition1');
      testUser(test, 'bob', [], 'partition1');
      testUser(test, 'joe', [], 'partition1');
      testUser(test, 'eve', ['editor'], 'partition2');
      testUser(test, 'bob', ['admin','editor'], 'partition2');
      testUser(test, 'joe', ['editor'], 'partition2');
    });

  Tinytest.add(
    'roles - can set user roles by partition including GLOBAL_PARTITION', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('editor');

      var eve = Meteor.users.findOne({_id: users.eve}),
          bob = Meteor.users.findOne({_id: users.bob}),
          joe = Meteor.users.findOne({_id: users.joe});
    
      Roles.addUsersToRoles(eve, 'admin', Roles.GLOBAL_PARTITION);
      testUser(test, 'eve', ['admin'], 'partition1');
      testUser(test, 'eve', ['admin']);

      Roles.setUserRoles(eve, 'editor', Roles.GLOBAL_PARTITION);
      testUser(test, 'eve', ['editor'], 'partition2');
      testUser(test, 'eve', ['editor']);
    });


  Tinytest.add(
    'roles - can get all roles', 
    function (test) {
      reset();

      _.each(roles, function (role) {
        Roles.createRole(role);
      });

      // compare roles, sorted alphabetically
      var expected = _.clone(roles),
          actual = _.pluck(Roles.getAllRoles().fetch(), '_id');

      test.equal(actual, expected);

      test.equal(_.pluck(Roles.getAllRoles({sort: {_id: -1}}).fetch(), '_id'), expected.reverse());
    });

  Tinytest.add(
    'roles - can\'t get roles for non-existant user', 
    function (test) {
      reset();
      test.equal(Roles.getRolesForUser('1'), []);
      test.equal(Roles.getRolesForUser('1', 'partition1'), []);
    });

  Tinytest.add(
    'roles - can get all roles for user', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');

      var userId = users.eve,
          userObj;

      // by userId
      test.equal(Roles.getRolesForUser(userId), []);

      // by user object
      userObj = Meteor.users.findOne({_id: userId});
      test.equal(Roles.getRolesForUser(userObj), []);


      Roles.addUsersToRoles(userId, ['admin', 'user']);

      // by userId
      test.equal(Roles.getRolesForUser(userId), ['admin', 'user']);

      // by user object
      userObj = Meteor.users.findOne({_id: userId});
      test.equal(Roles.getRolesForUser(userObj), ['admin', 'user']);

      test.equal(Roles.getRolesForUser(userId, {fullObjects: true}), [{
        _id: 'admin',
        partition: null,
        assigned: true
      }, {
        _id: 'user',
        partition: null,
        assigned: true
      }]);
    });

  Tinytest.add(
    'roles - can get all roles for user by partition', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');

      var userId = users.eve,
          userObj;

      // by userId
      test.equal(Roles.getRolesForUser(userId, 'partition1'), []);

      // by user object
      userObj = Meteor.users.findOne({_id: userId});
      test.equal(Roles.getRolesForUser(userObj, 'partition1'), []);

      // add roles
      Roles.addUsersToRoles(userId, ['admin', 'user'], 'partition1');
      Roles.addUsersToRoles(userId, ['admin'], 'partition2');

      // by userId
      test.equal(Roles.getRolesForUser(userId, 'partition1'), ['admin', 'user']);
      test.equal(Roles.getRolesForUser(userId, 'partition2'), ['admin']);
      test.equal(Roles.getRolesForUser(userId), []);

      // by user object
      userObj = Meteor.users.findOne({_id: userId});
      test.equal(Roles.getRolesForUser(userObj, 'partition1'), ['admin', 'user']);
      test.equal(Roles.getRolesForUser(userObj, 'partition2'), ['admin']);
      test.equal(Roles.getRolesForUser(userObj), []);

      test.equal(Roles.getRolesForUser(userId, {fullObjects: true, partition: 'partition1'}), [{
        _id: 'admin',
        partition: 'partition1',
        assigned: true
      }, {
        _id: 'user',
        partition: 'partition1',
        assigned: true
      }]);
      test.equal(Roles.getRolesForUser(userId, {fullObjects: true, partition: 'partition2'}), [{
        _id: 'admin',
        partition: 'partition2',
        assigned: true
      }]);

      test.equal(Roles.getRolesForUser(userId, {fullObjects: true, anyPartition: true}), [{
        _id: 'admin',
        partition: 'partition1',
        assigned: true
      }, {
        _id: 'user',
        partition: 'partition1',
        assigned: true
      }, {
        _id: 'admin',
        partition: 'partition2',
        assigned: true
      }]);

      Roles.createRole('PERMISSION');
      Roles.addRoleParent('PERMISSION', 'user');

      test.equal(Roles.getRolesForUser(userId, {fullObjects: true, partition: 'partition1'}), [{
        _id: 'admin',
        partition: 'partition1',
        assigned: true
      }, {
        _id: 'user',
        partition: 'partition1',
        assigned: true
      }, {
        _id: 'PERMISSION',
        partition: 'partition1',
        assigned: false
      }]);
      test.equal(Roles.getRolesForUser(userId, {fullObjects: true, partition: 'partition2'}), [{
        _id: 'admin',
        partition: 'partition2',
        assigned: true
      }]);
      test.equal(Roles.getRolesForUser(userId, {partition: 'partition1'}), ['admin', 'user', 'PERMISSION']);
      test.equal(Roles.getRolesForUser(userId, {partition: 'partition2'}), ['admin']);

      test.equal(Roles.getRolesForUser(userId, {fullObjects: true, anyPartition: true}), [{
        _id: 'admin',
        partition: 'partition1',
        assigned: true
      }, {
        _id: 'user',
        partition: 'partition1',
        assigned: true
      }, {
        _id: 'admin',
        partition: 'partition2',
        assigned: true
      }, {
        _id: 'PERMISSION',
        partition: 'partition1',
        assigned: false
      }]);
      test.equal(Roles.getRolesForUser(userId, {anyPartition: true}), ['admin', 'user', 'PERMISSION']);

      test.equal(Roles.getRolesForUser(userId, {fullObjects: true, partition: 'partition1', onlyAssigned: true}), [{
        _id: 'admin',
        partition: 'partition1',
        assigned: true
      }, {
        _id: 'user',
        partition: 'partition1',
        assigned: true
      }]);
      test.equal(Roles.getRolesForUser(userId, {fullObjects: true, partition: 'partition2', onlyAssigned: true}), [{
        _id: 'admin',
        partition: 'partition2',
        assigned: true
      }]);
      test.equal(Roles.getRolesForUser(userId, {partition: 'partition1', onlyAssigned: true}), ['admin', 'user']);
      test.equal(Roles.getRolesForUser(userId, {partition: 'partition2', onlyAssigned: true}), ['admin']);

      test.equal(Roles.getRolesForUser(userId, {fullObjects: true, anyPartition: true, onlyAssigned: true}), [{
        _id: 'admin',
        partition: 'partition1',
        assigned: true
      }, {
        _id: 'user',
        partition: 'partition1',
        assigned: true
      }, {
        _id: 'admin',
        partition: 'partition2',
        assigned: true
      }]);
      test.equal(Roles.getRolesForUser(userId, {anyPartition: true, onlyAssigned: true}), ['admin', 'user']);
    });

  Tinytest.add(
    'roles - can get all roles for user by partition with periods in name', 
    function (test) {
      reset();

      Roles.createRole('admin');

      Roles.addUsersToRoles(users.joe, ['admin'], 'example.k12.va.us');

      test.equal(Roles.getRolesForUser(users.joe, 'example.k12.va.us'), ['admin']);
    });

  Tinytest.add(
    'roles - can get all roles for user by partition including Roles.GLOBAL_PARTITION', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      var userId = users.eve,
          userObj;

      Roles.addUsersToRoles([users.eve], ['editor'], Roles.GLOBAL_PARTITION);
      Roles.addUsersToRoles([users.eve], ['admin', 'user'], 'partition1');

      // by userId
      test.equal(Roles.getRolesForUser(userId, 'partition1'), ['editor', 'admin', 'user']);
      test.equal(Roles.getRolesForUser(userId), ['editor']);

      // by user object
      userObj = Meteor.users.findOne({_id: userId});
      test.equal(Roles.getRolesForUser(userObj, 'partition1'), ['editor', 'admin', 'user']);
      test.equal(Roles.getRolesForUser(userObj), ['editor']);
    });


  Tinytest.add(
    'roles - getRolesForUser should not return null entries if user has no roles for partition', 
    function (test) {
      reset();

      Roles.createRole('editor');

      var userId = users.eve,
          userObj;

      // by userId
      test.equal(Roles.getRolesForUser(userId, 'partition1'), []);
      test.equal(Roles.getRolesForUser(userId), []);

      // by user object
      userObj = Meteor.users.findOne({_id: userId});
      test.equal(Roles.getRolesForUser(userObj, 'partition1'), []);
      test.equal(Roles.getRolesForUser(userObj), []);


      Roles.addUsersToRoles([users.eve], ['editor'], Roles.GLOBAL_PARTITION);

      // by userId
      test.equal(Roles.getRolesForUser(userId, 'partition1'), ['editor']);
      test.equal(Roles.getRolesForUser(userId), ['editor']);

      // by user object
      userObj = Meteor.users.findOne({_id: userId});
      test.equal(Roles.getRolesForUser(userObj, 'partition1'), ['editor']);
      test.equal(Roles.getRolesForUser(userObj), ['editor']);
    });
    
  Tinytest.add(
    'roles - can get all partitions for user', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      var userId = users.eve,
          userObj;

      Roles.addUsersToRoles([users.eve], ['editor'], 'partition1');
      Roles.addUsersToRoles([users.eve], ['admin', 'user'], 'partition2');

      // by userId
      test.equal(Roles.getPartitionsForUser(userId), ['partition1', 'partition2']);

      // by user object
      userObj = Meteor.users.findOne({_id: userId});
      test.equal(Roles.getPartitionsForUser(userObj), ['partition1', 'partition2']);
    });
  
  Tinytest.add(
    'roles - can get all partitions for user by role', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      var userId = users.eve,
          userObj;

      Roles.addUsersToRoles([users.eve], ['editor'], 'partition1');
      Roles.addUsersToRoles([users.eve], ['editor', 'user'], 'partition2');

      // by userId
      test.equal(Roles.getPartitionsForUser(userId, 'user'), ['partition2']);
      test.equal(Roles.getPartitionsForUser(userId, 'editor'), ['partition1', 'partition2']);
      test.equal(Roles.getPartitionsForUser(userId, 'admin'), []);

      // by user object
      userObj = Meteor.users.findOne({_id: userId});
      test.equal(Roles.getPartitionsForUser(userObj, 'user'), ['partition2']);
      test.equal(Roles.getPartitionsForUser(userObj, 'editor'), ['partition1', 'partition2']);
      test.equal(Roles.getPartitionsForUser(userObj, 'admin'), []);
  });
  
  Tinytest.add(
    'roles - getPartitionsForUser returns [] when not using partitions', 
    function (test) {
      reset();

      Roles.createRole('user');
      Roles.createRole('editor');

      var userId = users.eve,
          userObj;

      Roles.addUsersToRoles([users.eve], ['editor', 'user']);

      // by userId
      test.equal(Roles.getPartitionsForUser(userId), []);
      test.equal(Roles.getPartitionsForUser(userId, 'editor'), []);

      // by user object
      userObj = Meteor.users.findOne({_id: userId});
      test.equal(Roles.getPartitionsForUser(userObj), []);
      test.equal(Roles.getPartitionsForUser(userObj, 'editor'), []);
    });
  
  
  Tinytest.add(
    'roles - getting all partitions for user does not include GLOBAL_PARTITION', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      var userId = users.eve,
          userObj;

      Roles.addUsersToRoles([users.eve], ['editor'], 'partition1');
      Roles.addUsersToRoles([users.eve], ['editor', 'user'], 'partition2');
      Roles.addUsersToRoles([users.eve], ['editor', 'user', 'admin'], Roles.GLOBAL_PARTITION);

      // by userId
      test.equal(Roles.getPartitionsForUser(userId, 'user'), ['partition2']);
      test.equal(Roles.getPartitionsForUser(userId, 'editor'), ['partition1', 'partition2']);
      test.equal(Roles.getPartitionsForUser(userId, 'admin'), []);

      // by user object
      userObj = Meteor.users.findOne({_id: userId});
      test.equal(Roles.getPartitionsForUser(userObj, 'user'), ['partition2']);
      test.equal(Roles.getPartitionsForUser(userObj, 'editor'), ['partition1', 'partition2']);
      test.equal(Roles.getPartitionsForUser(userObj, 'admin'), []);
    });


  Tinytest.add(
    'roles - can get all users in role', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('editor');

      Roles.addUsersToRoles([users.eve, users.joe], ['admin', 'user']);
      Roles.addUsersToRoles([users.bob, users.joe], ['editor']);

      var expected = [users.eve, users.joe],
          actual = _.pluck(Roles.getUsersInRole('admin').fetch(), '_id');

      itemsEqual(test, actual, expected);
    });

  Tinytest.add(
    'roles - can get all users in role by partition', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');

      Roles.addUsersToRoles([users.eve, users.joe], ['admin', 'user'], 'partition1');
      Roles.addUsersToRoles([users.bob, users.joe], ['admin'], 'partition2');

      var expected = [users.eve, users.joe],
          actual = _.pluck(Roles.getUsersInRole('admin', 'partition1').fetch(), '_id');

      itemsEqual(test, actual, expected);

      expected = [users.eve, users.joe];
      actual = _.pluck(Roles.getUsersInRole('admin', {partition: 'partition1'}).fetch(), '_id');
      itemsEqual(test, actual, expected);

      expected = [users.eve, users.bob, users.joe];
      actual = _.pluck(Roles.getUsersInRole('admin', {anyPartition: true}).fetch(), '_id');
      itemsEqual(test, actual, expected);

      actual = _.pluck(Roles.getUsersInRole('admin').fetch(), '_id');
      test.equal(actual, []);
    });
  
  Tinytest.add(
    'roles - can get all users in role by partition including Roles.GLOBAL_PARTITION', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');

      Roles.addUsersToRoles([users.eve], ['admin', 'user'], Roles.GLOBAL_PARTITION);
      Roles.addUsersToRoles([users.bob, users.joe], ['admin'], 'partition2');

      var expected = [users.eve],
          actual = _.pluck(Roles.getUsersInRole('admin', 'partition1').fetch(), '_id');

      itemsEqual(test, actual, expected);

      expected = [users.eve, users.bob, users.joe];
      actual = _.pluck(Roles.getUsersInRole('admin', 'partition2').fetch(), '_id');

      itemsEqual(test, actual, expected);

      expected = [users.eve];
      actual = _.pluck(Roles.getUsersInRole('admin').fetch(), '_id');

      itemsEqual(test, actual, expected);

      expected = [users.eve, users.bob, users.joe];
      actual = _.pluck(Roles.getUsersInRole('admin', {anyPartition: true}).fetch(), '_id');

      itemsEqual(test, actual, expected);
    });

  Tinytest.add(
    'roles - can get all users in role by partition and passes through mongo query arguments', 
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');

      Roles.addUsersToRoles([users.eve, users.joe], ['admin', 'user'], 'partition1');
      Roles.addUsersToRoles([users.bob, users.joe], ['admin'], 'partition2');

      var results = Roles.getUsersInRole('admin','partition1', { fields: { username: 0 }, limit: 1 }).fetch();

      test.equal(1, results.length);
      test.isTrue(results[0].hasOwnProperty('_id'));
      test.isFalse(results[0].hasOwnProperty('username'));
    });


  Tinytest.add(
    'roles - can use Roles.GLOBAL_PARTITION to assign blanket roles',
    function (test) {
      reset();

      Roles.createRole('admin');

      Roles.addUsersToRoles([users.joe, users.bob], ['admin'], Roles.GLOBAL_PARTITION);

      testUser(test, 'eve', [], 'partition1');
      testUser(test, 'joe', ['admin'], 'partition2');
      testUser(test, 'joe', ['admin'], 'partition1');
      testUser(test, 'bob', ['admin'], 'partition2');
      testUser(test, 'bob', ['admin'], 'partition1');

      Roles.removeUsersFromRoles(users.joe, ['admin'], Roles.GLOBAL_PARTITION);

      testUser(test, 'eve', [], 'partition1');
      testUser(test, 'joe', [], 'partition2');
      testUser(test, 'joe', [], 'partition1');
      testUser(test, 'bob', ['admin'], 'partition2');
      testUser(test, 'bob', ['admin'], 'partition1');
    });

  Tinytest.add(
    'roles - Roles.GLOBAL_PARTITION is independent of other partitions',
    function (test) {
      reset();

      Roles.createRole('admin');

      Roles.addUsersToRoles([users.joe, users.bob], ['admin'], 'partition5');
      Roles.addUsersToRoles([users.joe, users.bob], ['admin'], Roles.GLOBAL_PARTITION);

      testUser(test, 'eve', [], 'partition1');
      testUser(test, 'joe', ['admin'], 'partition5');
      testUser(test, 'joe', ['admin'], 'partition2');
      testUser(test, 'joe', ['admin'], 'partition1');
      testUser(test, 'bob', ['admin'], 'partition5');
      testUser(test, 'bob', ['admin'], 'partition2');
      testUser(test, 'bob', ['admin'], 'partition1');

      Roles.removeUsersFromRoles(users.joe, ['admin'], Roles.GLOBAL_PARTITION);

      testUser(test, 'eve', [], 'partition1');
      testUser(test, 'joe', ['admin'], 'partition5');
      testUser(test, 'joe', [], 'partition2');
      testUser(test, 'joe', [], 'partition1');
      testUser(test, 'bob', ['admin'], 'partition5');
      testUser(test, 'bob', ['admin'], 'partition2');
      testUser(test, 'bob', ['admin'], 'partition1');
    });
  
  Tinytest.add(
    'roles - Roles.GLOBAL_PARTITION also checked when partition not specified',
    function (test) {
      reset();

      Roles.createRole('admin');

      Roles.addUsersToRoles(users.joe, 'admin', Roles.GLOBAL_PARTITION);

      testUser(test, 'joe', ['admin']);

      Roles.removeUsersFromRoles(users.joe, 'admin', Roles.GLOBAL_PARTITION);

      testUser(test, 'joe', []);
    });

  Tinytest.add(
    "roles - can use '.' in partition name",
    function (test) {
      reset();

      Roles.createRole('admin');

      Roles.addUsersToRoles(users.joe, ['admin'], 'example.com');
      testUser(test, 'joe', ['admin'], 'example.com');
    });

  Tinytest.add(
    "roles - can use multiple periods in partition name",
    function (test) {
      reset();

      Roles.createRole('admin');

      Roles.addUsersToRoles(users.joe, ['admin'], 'example.k12.va.us');
      testUser(test, 'joe', ['admin'], 'example.k12.va.us');
    });

  Tinytest.add(
    'roles - migration without global groups',
    function (test) {
      reset();

      test.isTrue(Meteor.roles.insert({name: 'admin'}));
      test.isTrue(Meteor.roles.insert({name: 'editor'}));
      test.isTrue(Meteor.roles.insert({name: 'user'}));

      test.isTrue(Meteor.users.update(users.eve, {$set: {roles: ['admin', 'editor']}}));
      test.isTrue(Meteor.users.update(users.bob, {$set: {roles: []}}));
      test.isTrue(Meteor.users.update(users.joe, {$set: {roles: ['user']}}));

      Roles._forwardMigrate();

      test.equal(Meteor.users.findOne(users.eve, {fields: {roles: 1, _id: 0}}), {
        roles: [{
          _id: 'admin',
          partition: null,
          assigned: true
        }, {
          _id: 'editor',
          partition: null,
          assigned: true
        }]
      });
      test.equal(Meteor.users.findOne(users.bob, {fields: {roles: 1, _id: 0}}), {
        roles: []
      });
      test.equal(Meteor.users.findOne(users.joe, {fields: {roles: 1, _id: 0}}), {
        roles: [{
          _id: 'user',
          partition: null,
          assigned: true
        }]
      });

      test.equal(Meteor.roles.findOne({_id: 'admin'}), {
        _id: 'admin',
        children: []
      });
      test.equal(Meteor.roles.findOne({_id: 'editor'}), {
        _id: 'editor',
        children: []
      });
      test.equal(Meteor.roles.findOne({_id: 'user'}), {
        _id: 'user',
        children: []
      });

      Roles._backwardMigrate(null, null, false);

      test.equal(Meteor.users.findOne(users.eve, {fields: {roles: 1, _id: 0}}), {
        roles: ['admin', 'editor']
      });
      test.equal(Meteor.users.findOne(users.bob, {fields: {roles: 1, _id: 0}}), {
        roles: []
      });
      test.equal(Meteor.users.findOne(users.joe, {fields: {roles: 1, _id: 0}}), {
        roles: ['user']
      });

      test.equal(Meteor.roles.findOne({name: 'admin'}, {fields: {_id: 0}}), {
        name: 'admin'
      });
      test.equal(Meteor.roles.findOne({name: 'editor'}, {fields: {_id: 0}}), {
        name: 'editor'
      });
      test.equal(Meteor.roles.findOne({name: 'user'}, {fields: {_id: 0}}), {
        name: 'user'
      });
    });

  Tinytest.add(
    'roles - migration with global groups',
    function (test) {
      reset();

      test.isTrue(Meteor.roles.insert({name: 'admin'}));
      test.isTrue(Meteor.roles.insert({name: 'editor'}));
      test.isTrue(Meteor.roles.insert({name: 'user'}));

      test.isTrue(Meteor.users.update(users.eve, {$set: {roles: {__global_roles__: ['admin', 'editor'], foo: ['user']}}}));
      test.isTrue(Meteor.users.update(users.bob, {$set: {roles: {}}}));
      test.isTrue(Meteor.users.update(users.joe, {$set: {roles: {__global_roles__: ['user'], foo: ['user']}}}));

      Roles._forwardMigrate();

      test.equal(Meteor.users.findOne(users.eve, {fields: {roles: 1, _id: 0}}), {
        roles: [{
          _id: 'admin',
          partition: null,
          assigned: true
        }, {
          _id: 'editor',
          partition: null,
          assigned: true
        }, {
          _id: 'user',
          partition: 'foo',
          assigned: true
        }]
      });
      test.equal(Meteor.users.findOne(users.bob, {fields: {roles: 1, _id: 0}}), {
        roles: []
      });
      test.equal(Meteor.users.findOne(users.joe, {fields: {roles: 1, _id: 0}}), {
        roles: [{
          _id: 'user',
          partition: null,
          assigned: true
        }, {
          _id: 'user',
          partition: 'foo',
          assigned: true
        }]
      });

      test.equal(Meteor.roles.findOne({_id: 'admin'}), {
        _id: 'admin',
        children: []
      });
      test.equal(Meteor.roles.findOne({_id: 'editor'}), {
        _id: 'editor',
        children: []
      });
      test.equal(Meteor.roles.findOne({_id: 'user'}), {
        _id: 'user',
        children: []
      });

      Roles._backwardMigrate(null, null, true);

      test.equal(Meteor.users.findOne(users.eve, {fields: {roles: 1, _id: 0}}), {
        roles: {
          __global_roles__: ['admin', 'editor'],
          foo: ['user']
        }
      });
      test.equal(Meteor.users.findOne(users.bob, {fields: {roles: 1, _id: 0}}), {
        roles: {}
      });
      test.equal(Meteor.users.findOne(users.joe, {fields: {roles: 1, _id: 0}}), {
        roles: {
          __global_roles__: ['user'],
          foo: ['user']
        }
      });

      test.equal(Meteor.roles.findOne({name: 'admin'}, {fields: {_id: 0}}), {
        name: 'admin'
      });
      test.equal(Meteor.roles.findOne({name: 'editor'}, {fields: {_id: 0}}), {
        name: 'editor'
      });
      test.equal(Meteor.roles.findOne({name: 'user'}, {fields: {_id: 0}}), {
        name: 'user'
      });
    });

  Tinytest.add(
    'roles - _assureConsistency',
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('ALL_PERMISSIONS');
      Roles.createRole('VIEW_PERMISSION');
      Roles.createRole('EDIT_PERMISSION');
      Roles.createRole('DELETE_PERMISSION');
      Roles.addRoleParent('ALL_PERMISSIONS', 'user');
      Roles.addRoleParent('EDIT_PERMISSION', 'ALL_PERMISSIONS');
      Roles.addRoleParent('VIEW_PERMISSION', 'ALL_PERMISSIONS');
      Roles.addRoleParent('DELETE_PERMISSION', 'admin');

      Roles.addUsersToRoles(users.eve, ['user'], 'partition1');
      Roles.addUsersToRoles(users.eve, ['user'], 'partition2');

      var correctRoles = [{
        _id: 'user',
        partition: 'partition1',
        assigned: true
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: 'partition1',
        assigned: false
      }, {
        _id: 'EDIT_PERMISSION',
        partition: 'partition1',
        assigned: false
      }, {
        _id: 'VIEW_PERMISSION',
        partition: 'partition1',
        assigned: false
      }, {
        _id: 'user',
        partition: 'partition2',
        assigned: true
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: 'partition2',
        assigned: false
      }, {
        _id: 'EDIT_PERMISSION',
        partition: 'partition2',
        assigned: false
      }, {
        _id: 'VIEW_PERMISSION',
        partition: 'partition2',
        assigned: false
      }];

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), correctRoles);

      // let's remove all automatically assigned roles
      // _assureConsistency should recreate those roles
      Meteor.users.update(users.eve, {$pull: {roles: {assigned: false}}});

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'user',
        partition: 'partition1',
        assigned: true
      }, {
        _id: 'user',
        partition: 'partition2',
        assigned: true
      }]);

      Roles._assureConsistency(users.eve);

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), correctRoles);

      // add an extra role, faking that it is automatically assigned
      // _assureConsistency should remove this extra role
      Meteor.users.update(users.eve, {$push: {roles: {_id: 'DELETE_PERMISSION', partition: null, assigned: false}}});

      Roles._assureConsistency(users.eve);

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), correctRoles);

      // remove a role, _assureConsistency should remove it from the user
      Meteor.roles.remove({_id: 'VIEW_PERMISSION'});

      Roles._assureConsistency(users.eve);

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'user',
        partition: 'partition1',
        assigned: true
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: 'partition1',
        assigned: false
      }, {
        _id: 'EDIT_PERMISSION',
        partition: 'partition1',
        assigned: false
      }, {
        _id: 'user',
        partition: 'partition2',
        assigned: true
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: 'partition2',
        assigned: false
      }, {
        _id: 'EDIT_PERMISSION',
        partition: 'partition2',
        assigned: false
      }]);
    });

  Tinytest.add(
    'roles - _addUserToRole',
    function (test) {
      reset();

      Roles.createRole('admin');

      // add role with assigned set to true
      Roles._addUserToRole(users.eve, 'admin', {partition: null, ifExists: false, _assigned: true});

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'admin',
        partition: null,
        assigned: true
      }]);

      // change assigned to false
      Roles._addUserToRole(users.eve, 'admin', {partition: null, ifExists: false, _assigned: false});

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'admin',
        partition: null,
        assigned: false
      }]);

      Roles.setUserRoles(users.eve, []);

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), []);

      // add role with assigned set to false
      Roles._addUserToRole(users.eve, 'admin', {partition: null, ifExists: false, _assigned: null});

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'admin',
        partition: null,
        assigned: false
      }]);

      // change assigned to true
      Roles._addUserToRole(users.eve, 'admin', {partition: null, ifExists: false, _assigned: true});

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'admin',
        partition: null,
        assigned: true
      }]);

      // do not change assigned
      Roles._addUserToRole(users.eve, 'admin', {partition: null, ifExists: false, _assigned: null});

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'admin',
        partition: null,
        assigned: true
      }]);
    });

  Tinytest.add(
    'roles - _removeUserFromRole',
    function (test) {
      reset();

      Roles.createRole('admin');

      Roles.addUsersToRoles(users.eve, 'admin');

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'admin',
        partition: null,
        assigned: true
      }]);

      // remove only roles with assigned set to false, thus do not remove anything
      Roles._removeUserFromRole(users.eve, 'admin', {partition: null, _assigned: false});

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'admin',
        partition: null,
        assigned: true
      }]);

      // remove only roles with assigned set to true
      Roles._removeUserFromRole(users.eve, 'admin', {partition: null, _assigned: true});

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), []);

      Roles.addUsersToRoles(users.eve, 'admin');

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'admin',
        partition: null,
        assigned: true
      }]);

      // remove roles no matter the assignment
      Roles._removeUserFromRole(users.eve, 'admin', {partition: null, _assigned: null});

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), []);

      Roles.addUsersToRoles(users.eve, 'admin', {_assigned: false});

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'admin',
        partition: null,
        assigned: false
      }]);

      // remove only roles with assigned set to true, thus do not remove anything
      Roles._removeUserFromRole(users.eve, 'admin', {partition: null, _assigned: true});

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'admin',
        partition: null,
        assigned: false
      }]);

      // remove only roles with assigned set to false
      Roles._removeUserFromRole(users.eve, 'admin', {partition: null, _assigned: false});

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), []);
    });

  Tinytest.add(
    'roles - keep assigned roles',
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('ALL_PERMISSIONS');
      Roles.createRole('VIEW_PERMISSION');
      Roles.createRole('EDIT_PERMISSION');
      Roles.createRole('DELETE_PERMISSION');
      Roles.addRoleParent('ALL_PERMISSIONS', 'user');
      Roles.addRoleParent('EDIT_PERMISSION', 'ALL_PERMISSIONS');
      Roles.addRoleParent('VIEW_PERMISSION', 'ALL_PERMISSIONS');
      Roles.addRoleParent('DELETE_PERMISSION', 'admin');

      Roles.addUsersToRoles(users.eve, ['user']);

      test.isTrue(Roles.userIsInRole(users.eve, 'VIEW_PERMISSION'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'user',
        partition: null,
        assigned: true
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: null,
        assigned: false
      }, {
        _id: 'EDIT_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'VIEW_PERMISSION',
        partition: null,
        assigned: false
      }]);

      Roles.addUsersToRoles(users.eve, 'VIEW_PERMISSION');

      test.isTrue(Roles.userIsInRole(users.eve, 'VIEW_PERMISSION'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'user',
        partition: null,
        assigned: true
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: null,
        assigned: false
      }, {
        _id: 'EDIT_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'VIEW_PERMISSION',
        partition: null,
        assigned: true
      }]);

      Roles.removeUsersFromRoles(users.eve, 'user');

      test.isTrue(Roles.userIsInRole(users.eve, 'VIEW_PERMISSION'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'VIEW_PERMISSION',
        partition: null,
        assigned: true
      }]);

      Roles.removeUsersFromRoles(users.eve, 'VIEW_PERMISSION');

      test.isFalse(Roles.userIsInRole(users.eve, 'VIEW_PERMISSION'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), []);
    });

  Tinytest.add(
    'roles - modify assigned hierarchical roles',
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('ALL_PERMISSIONS');
      Roles.createRole('VIEW_PERMISSION');
      Roles.createRole('EDIT_PERMISSION');
      Roles.createRole('DELETE_PERMISSION');
      Roles.addRoleParent('ALL_PERMISSIONS', 'user');
      Roles.addRoleParent('EDIT_PERMISSION', 'ALL_PERMISSIONS');
      Roles.addRoleParent('VIEW_PERMISSION', 'ALL_PERMISSIONS');
      Roles.addRoleParent('DELETE_PERMISSION', 'admin');

      Roles.addUsersToRoles(users.eve, ['user']);
      Roles.addUsersToRoles(users.eve, ['ALL_PERMISSIONS'], 'partition');

      test.isFalse(Roles.userIsInRole(users.eve, 'MODERATE_PERMISSION'));
      test.isFalse(Roles.userIsInRole(users.eve, 'MODERATE_PERMISSION', 'partition'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'user',
        partition: null,
        assigned: true
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: null,
        assigned: false
      }, {
        _id: 'EDIT_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'VIEW_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: 'partition',
        assigned: true
      }, {
        _id: 'EDIT_PERMISSION',
        partition: 'partition',
        assigned: false
      }, {
        _id: 'VIEW_PERMISSION',
        partition: 'partition',
        assigned: false
      }]);

      Roles.createRole('MODERATE_PERMISSION');

      Roles.addRoleParent('MODERATE_PERMISSION', 'ALL_PERMISSIONS');

      test.isTrue(Roles.userIsInRole(users.eve, 'MODERATE_PERMISSION'));
      test.isTrue(Roles.userIsInRole(users.eve, 'MODERATE_PERMISSION', 'partition'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'user',
        partition: null,
        assigned: true
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: null,
        assigned: false
      }, {
        _id: 'EDIT_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'VIEW_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: 'partition',
        assigned: true
      }, {
        _id: 'EDIT_PERMISSION',
        partition: 'partition',
        assigned: false
      }, {
        _id: 'VIEW_PERMISSION',
        partition: 'partition',
        assigned: false
      }, {
        _id: 'MODERATE_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'MODERATE_PERMISSION',
        partition: 'partition',
        assigned: false
      }]);

      Roles.addUsersToRoles(users.eve, ['admin']);

      test.isTrue(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION'));
      test.isTrue(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION', 'partition'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'user',
        partition: null,
        assigned: true
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: null,
        assigned: false
      }, {
        _id: 'EDIT_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'VIEW_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: 'partition',
        assigned: true
      }, {
        _id: 'EDIT_PERMISSION',
        partition: 'partition',
        assigned: false
      }, {
        _id: 'VIEW_PERMISSION',
        partition: 'partition',
        assigned: false
      }, {
        _id: 'MODERATE_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'MODERATE_PERMISSION',
        partition: 'partition',
        assigned: false
      }, {
        _id: 'admin',
        partition: null,
        assigned: true
      }, {
        _id: 'DELETE_PERMISSION',
        partition: null,
        assigned: false
      }]);

      Roles.addRoleParent('DELETE_PERMISSION', 'ALL_PERMISSIONS');

      test.isTrue(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION'));
      test.isTrue(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION', 'partition'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'user',
        partition: null,
        assigned: true
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: null,
        assigned: false
      }, {
        _id: 'EDIT_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'VIEW_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: 'partition',
        assigned: true
      }, {
        _id: 'EDIT_PERMISSION',
        partition: 'partition',
        assigned: false
      }, {
        _id: 'VIEW_PERMISSION',
        partition: 'partition',
        assigned: false
      }, {
        _id: 'MODERATE_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'MODERATE_PERMISSION',
        partition: 'partition',
        assigned: false
      }, {
        _id: 'admin',
        partition: null,
        assigned: true
      }, {
        _id: 'DELETE_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'DELETE_PERMISSION',
        partition: 'partition',
        assigned: false
      }]);

      Roles.removeUsersFromRoles(users.eve, ['admin']);

      test.isTrue(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION'));
      test.isTrue(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION', 'partition'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'user',
        partition: null,
        assigned: true
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: null,
        assigned: false
      }, {
        _id: 'EDIT_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'VIEW_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'ALL_PERMISSIONS',
        partition: 'partition',
        assigned: true
      }, {
        _id: 'EDIT_PERMISSION',
        partition: 'partition',
        assigned: false
      }, {
        _id: 'VIEW_PERMISSION',
        partition: 'partition',
        assigned: false
      }, {
        _id: 'MODERATE_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'MODERATE_PERMISSION',
        partition: 'partition',
        assigned: false
      }, {
        _id: 'DELETE_PERMISSION',
        partition: null,
        assigned: false
      }, {
        _id: 'DELETE_PERMISSION',
        partition: 'partition',
        assigned: false
      }]);

      Roles.deleteRole('ALL_PERMISSIONS');

      test.isFalse(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION'));
      test.isFalse(Roles.userIsInRole(users.eve, 'DELETE_PERMISSION', 'partition'));

      test.isFalse(Roles.userIsInRole(users.eve, 'MODERATE_PERMISSION'));
      test.isFalse(Roles.userIsInRole(users.eve, 'MODERATE_PERMISSION', 'partition'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'user',
        partition: null,
        assigned: true
      }]);
    });

  Tinytest.add(
    'roles - delete role with overlapping hierarchical roles',
    function (test) {
      reset();

      Roles.createRole('role1');
      Roles.createRole('role2');
      Roles.createRole('COMMON_PERMISSION_1');
      Roles.createRole('COMMON_PERMISSION_2');
      Roles.createRole('COMMON_PERMISSION_3');
      Roles.createRole('EXTRA_PERMISSION_ROLE_1');
      Roles.createRole('EXTRA_PERMISSION_ROLE_2');

      Roles.addRoleParent('COMMON_PERMISSION_1', 'role1');
      Roles.addRoleParent('COMMON_PERMISSION_2', 'role1');
      Roles.addRoleParent('COMMON_PERMISSION_3', 'role1');
      Roles.addRoleParent('EXTRA_PERMISSION_ROLE_1', 'role1');

      Roles.addRoleParent('COMMON_PERMISSION_1', 'role2');
      Roles.addRoleParent('COMMON_PERMISSION_2', 'role2');
      Roles.addRoleParent('COMMON_PERMISSION_3', 'role2');
      Roles.addRoleParent('EXTRA_PERMISSION_ROLE_2', 'role2');

      Roles.addUsersToRoles(users.eve, 'role1');
      Roles.addUsersToRoles(users.eve, 'role2');

      test.isTrue(Roles.userIsInRole(users.eve, 'COMMON_PERMISSION_1'));
      test.isTrue(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_1'));
      test.isTrue(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_2'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'role1',
        partition: null,
        assigned: true
      }, {
        _id: 'role2',
        partition: null,
        assigned: true
      }, {
        _id: 'COMMON_PERMISSION_1',
        partition: null,
        assigned: false
      }, {
        _id: 'COMMON_PERMISSION_2',
        partition: null,
        assigned: false
      }, {
        _id: 'COMMON_PERMISSION_3',
        partition: null,
        assigned: false
      }, {
        _id: 'EXTRA_PERMISSION_ROLE_1',
        partition: null,
        assigned: false
      }, {
        _id: 'EXTRA_PERMISSION_ROLE_2',
        partition: null,
        assigned: false
      }]);

      Roles.removeUsersFromRoles(users.eve, 'role2');

      test.isTrue(Roles.userIsInRole(users.eve, 'COMMON_PERMISSION_1'));
      test.isTrue(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_1'));
      test.isFalse(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_2'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'role1',
        partition: null,
        assigned: true
      }, {
        _id: 'COMMON_PERMISSION_1',
        partition: null,
        assigned: false
      }, {
        _id: 'COMMON_PERMISSION_2',
        partition: null,
        assigned: false
      }, {
        _id: 'COMMON_PERMISSION_3',
        partition: null,
        assigned: false
      }, {
        _id: 'EXTRA_PERMISSION_ROLE_1',
        partition: null,
        assigned: false
      }]);

      Roles.addUsersToRoles(users.eve, 'role2');

      test.isTrue(Roles.userIsInRole(users.eve, 'COMMON_PERMISSION_1'));
      test.isTrue(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_1'));
      test.isTrue(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_2'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'role1',
        partition: null,
        assigned: true
      }, {
        _id: 'role2',
        partition: null,
        assigned: true
      }, {
        _id: 'COMMON_PERMISSION_1',
        partition: null,
        assigned: false
      }, {
        _id: 'COMMON_PERMISSION_2',
        partition: null,
        assigned: false
      }, {
        _id: 'COMMON_PERMISSION_3',
        partition: null,
        assigned: false
      }, {
        _id: 'EXTRA_PERMISSION_ROLE_1',
        partition: null,
        assigned: false
      }, {
        _id: 'EXTRA_PERMISSION_ROLE_2',
        partition: null,
        assigned: false
      }]);

      Roles.deleteRole('role2');

      test.isTrue(Roles.userIsInRole(users.eve, 'COMMON_PERMISSION_1'));
      test.isTrue(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_1'));
      test.isFalse(Roles.userIsInRole(users.eve, 'EXTRA_PERMISSION_ROLE_2'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'role1',
        partition: null,
        assigned: true
      }, {
        _id: 'COMMON_PERMISSION_1',
        partition: null,
        assigned: false
      }, {
        _id: 'COMMON_PERMISSION_2',
        partition: null,
        assigned: false
      }, {
        _id: 'COMMON_PERMISSION_3',
        partition: null,
        assigned: false
      }, {
        _id: 'EXTRA_PERMISSION_ROLE_1',
        partition: null,
        assigned: false
      }]);
    });

  Tinytest.add(
    'roles - set parent on assigned role',
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('EDIT_PERMISSION');

      Roles.addUsersToRoles(users.eve, 'EDIT_PERMISSION');

      test.isTrue(Roles.userIsInRole(users.eve, 'EDIT_PERMISSION'));
      test.isFalse(Roles.userIsInRole(users.eve, 'admin'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'EDIT_PERMISSION',
        partition: null,
        assigned: true
      }]);

      Roles.addRoleParent('EDIT_PERMISSION', 'admin');

      test.isTrue(Roles.userIsInRole(users.eve, 'EDIT_PERMISSION'));
      test.isFalse(Roles.userIsInRole(users.eve, 'admin'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'EDIT_PERMISSION',
        partition: null,
        assigned: true
      }]);
    });

  Tinytest.add(
    'roles - remove parent on assigned role',
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('EDIT_PERMISSION');

      Roles.addRoleParent('EDIT_PERMISSION', 'admin');

      Roles.addUsersToRoles(users.eve, 'EDIT_PERMISSION');

      test.isTrue(Roles.userIsInRole(users.eve, 'EDIT_PERMISSION'));
      test.isFalse(Roles.userIsInRole(users.eve, 'admin'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'EDIT_PERMISSION',
        partition: null,
        assigned: true
      }]);

      Roles.removeRoleParent('EDIT_PERMISSION', 'admin');

      test.isTrue(Roles.userIsInRole(users.eve, 'EDIT_PERMISSION'));
      test.isFalse(Roles.userIsInRole(users.eve, 'admin'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'EDIT_PERMISSION',
        partition: null,
        assigned: true
      }]);
    });

  Tinytest.add(
    'roles - adding and removing extra role parents',
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('user');
      Roles.createRole('EDIT_PERMISSION');

      Roles.addRoleParent('EDIT_PERMISSION', 'admin');

      Roles.addUsersToRoles(users.eve, 'EDIT_PERMISSION');

      test.isTrue(Roles.userIsInRole(users.eve, 'EDIT_PERMISSION'));
      test.isFalse(Roles.userIsInRole(users.eve, 'admin'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'EDIT_PERMISSION',
        partition: null,
        assigned: true
      }]);

      Roles.addRoleParent('EDIT_PERMISSION', 'user');

      test.isTrue(Roles.userIsInRole(users.eve, 'EDIT_PERMISSION'));
      test.isFalse(Roles.userIsInRole(users.eve, 'admin'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'EDIT_PERMISSION',
        partition: null,
        assigned: true
      }]);

      Roles.removeRoleParent('EDIT_PERMISSION', 'user');

      test.isTrue(Roles.userIsInRole(users.eve, 'EDIT_PERMISSION'));
      test.isFalse(Roles.userIsInRole(users.eve, 'admin'));

      itemsEqual(test, Roles.getRolesForUser(users.eve, {anyPartition: true, fullObjects: true}), [{
        _id: 'EDIT_PERMISSION',
        partition: null,
        assigned: true
      }]);
    });

  Tinytest.add(
    'roles - cyclic roles',
    function (test) {
      reset();

      Roles.createRole('admin');
      Roles.createRole('editor');
      Roles.createRole('user');

      Roles.addRoleParent('editor', 'admin');
      Roles.addRoleParent('user', 'editor');

      test.throws(function () {
        Roles.addRoleParent('admin', 'user');
      }, /form a cycle/);
    });

  function printException (ex) {
    var tmp = {};
    for (var key in ex) {
      if (key != 'stack') {
        tmp[key] = ex[key];
      }
    }
    console.log(JSON.stringify(tmp));
  }

}());
