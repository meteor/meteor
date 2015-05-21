var logoutStep = function (test, expect) {
  Meteor.logout(expect(function (error) {
    test.equal(error, undefined);
    test.equal(Meteor.user(), null);
  }));
};
var loggedInAs = function (someUsername, test, expect) {
  return expect(function (error) {
    test.equal(error, undefined);
    test.equal(Meteor.user().username, someUsername);
  });
};

// This is the same as the tests we used to have inside accounts-password to
// make sure the default allow rule worked.
testAsyncMulti("backcompat-editable-profile - allow rules", [
  // create a second user to have an id for in a later test
  function (test, expect) {
    this.otherUsername = Random.id();
    Accounts.createUser(
      {username: this.otherUsername, password: 'dontcare',
       testOnCreateUserHook: true},
      loggedInAs(this.otherUsername, test, expect));
  },
  function (test, expect) {
    this.otherUserId = Meteor.userId();
  },
  function (test, expect) {
    // real setup
    this.username = Random.id();
    this.password = 'password';

    Accounts.createUser(
      {username: this.username, password: this.password,
       testOnCreateUserHook: true},
      loggedInAs(this.username, test, expect));
  },
  // test the default Meteor.users allow rule. This test properly belongs in
  // accounts-base/accounts_tests.js, but this is where the tests that
  // actually log in are.
  function(test, expect) {
    this.userId = Meteor.userId();
    test.notEqual(this.userId, null);
    test.notEqual(this.userId, this.otherUserId);
    // Can't update any fields on the current user, including `profile`.
    Meteor.users.update(
      this.userId, {$set: {disallowed: true, 'profile.updated': 42}},
      expect(function (err) {
        test.isTrue(err);
        test.equal(err.error, 403);
        test.isFalse(_.has(Meteor.user(), 'disallowed'));
        test.isFalse(_.has(Meteor.user(), 'profile'));
      }));
  },
  function(test, expect) {
    // Can't update another user.
    Meteor.users.update(
      this.otherUserId, {$set: {'profile.updated': 42}},
      expect(function (err) {
        test.isTrue(err);
        test.equal(err.error, 403);
      }));
  },
  function(test, expect) {
    // Can't update using a non-ID selector. (This one is thrown client-side.)
    test.throws(function () {
      Meteor.users.update(
        {username: this.username}, {$set: {'profile.updated': 42}});
    });
    test.isFalse(_.has(Meteor.user(), 'profile'));
  },
  function(test, expect) {
    // Can update own profile using ID.
    Meteor.users.update(
      this.userId, {$set: {'profile.updated': 42}},
      expect(function (err) {
        test.isFalse(err);
        test.equal(42, Meteor.user().profile.updated);
      }));
  },
  logoutStep
]);