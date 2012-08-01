(function () {

  // XXX note, only one test can do login/logout things at once! for
  // now, that is this test.

  var username = Meteor.uuid();
  var username2 = Meteor.uuid();
  var username3 = Meteor.uuid();
  var email = Meteor.uuid() + '@example.com';
  var password = 'password';
  var password2 = 'password2';
  var password3 = 'password3';

  var logoutStep = function (test, expect) {
    Meteor.logout(expect(function (error) {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  };

  testAsyncMulti("passwords - long series", [
    function (test, expect) {
      // XXX argh quiescence + tests === wtf. and i have no idea why
      // this was necessary here and not in other places. probably
      // because it's dependant on how long method call chains are in
      // other tests
      var quiesceCallback = expect(function () {
        test.equal(Meteor.user().username, username);
      });
      Meteor.createUser({username: username, email: email, password: password},
                        expect(function (error) {
                          test.equal(error, undefined);
                          Meteor.default_connection.onQuiesce(quiesceCallback);
                        }));
    },
    logoutStep,
    function (test, expect) {
      Meteor.loginWithPassword(username, password, expect(function (error) {
        test.equal(error, undefined);
        test.equal(Meteor.user().username, username);
      }));
    },
    logoutStep,
    function (test, expect) {
      Meteor.loginWithPassword({username: username}, password, expect(function (error) {
        test.equal(error, undefined);
        test.equal(Meteor.user().username, username);
      }));
    },
    logoutStep,
    function (test, expect) {
      Meteor.loginWithPassword(email, password, expect(function (error) {
        test.equal(error, undefined);
        test.equal(Meteor.user().username, username);
      }));
    },
    logoutStep,
    function (test, expect) {
      Meteor.loginWithPassword({email: email}, password, expect(function (error) {
        test.equal(error, undefined);
        test.equal(Meteor.user().username, username);
      }));
    },
    logoutStep,
    // plain text password. no API for this, have to send a raw message.
    function (test, expect) {
      Meteor.call(
        // wrong password
        'login', {user: {email: email}, password: password2},
        expect(function (error, result) {
          test.isTrue(error);
          test.isFalse(result);
          test.isFalse(Meteor.user());
      }));
    },
    function (test, expect) {
      Meteor.call(
        // right password
        'login', {user: {email: email}, password: password},
        expect(function (error, result) {
          test.equal(error, undefined);
          test.isTrue(result.id);
          test.isTrue(result.token);
          // emulate the real login behavior, so as not to confuse test.
          Meteor.accounts.makeClientLoggedIn(result.id, result.token);
          test.equal(Meteor.user().username, username);
      }));
    },
    // change password with bad old password.
    function (test, expect) {
      Meteor.changePassword(password2, password2, expect(function (error) {
        test.isTrue(error);
        test.equal(Meteor.user().username, username);
      }));
    },
    // change password with good old password.
    function (test, expect) {
      Meteor.changePassword(password, password2, expect(function (error) {
        test.equal(error, undefined);
        test.equal(Meteor.user().username, username);
      }));
    },
    logoutStep,
    // old password, failed login
    function (test, expect) {
      Meteor.loginWithPassword(email, password, expect(function (error) {
        test.isTrue(error);
        test.isFalse(Meteor.user());
      }));
    },
    // new password, success
    function (test, expect) {
      Meteor.loginWithPassword(email, password2, expect(function (error) {
        test.equal(error, undefined);
        test.equal(Meteor.user().username, username);
      }));
    },
    // change w/ no old password. allowed due to config.
    function (test, expect) {
      Meteor.changePassword(null, password3, expect(function (error) {
        test.equal(error, undefined);
        test.equal(Meteor.user().username, username);
      }));
    },
    logoutStep,
    // new password, success
    function (test, expect) {
      Meteor.loginWithPassword(email, password3, expect(function (error) {
        test.equal(error, undefined);
        test.equal(Meteor.user().username, username);
      }));
    },
    logoutStep,
    // create user with raw password
    function (test, expect) {
      Meteor.call('createUser', {username: username2, password: password2},
                  expect(function (error, result) {
                    test.equal(error, undefined);
                    test.isTrue(result.id);
                    test.isTrue(result.token);
                    // emulate the real login behavior, so as not to confuse test.
                    Meteor.accounts.makeClientLoggedIn(result.id, result.token);
                    test.equal(Meteor.user().username, username2);
                  }));
    },
    logoutStep,
    function(test, expect) {
      Meteor.loginWithPassword({username: username2}, password2,
                               expect(function (error) {
                                 test.equal(error, undefined);
                                 test.equal(Meteor.user().username, username2);
                               }));
    },
    logoutStep,
    // test Meteor.accounts.validateNewUser
    function(test, expect) {
      Meteor.createUser({username: username3, password: password3},
                        {invalid: true}, // should fail the new user validators
                        expect(function (error) {
                          test.equal(error.error, 403);
                        }));
    },
    // test Meteor.accounts.onCreateUser
    function(test, expect) {
      Meteor.createUser({username: username3, password: password3},
                        {testOnCreateUserHook: true}, expect(function () {
        test.equal(Meteor.user().touchedByOnCreateUser, true);
      }));
    },
    // can't call onCreateUserHook twice
    function(test, expect) {
      Meteor.call('setupMoreThanOneOnCreateUserHook',
                  {testOnCreateUserHook: true}, expect(function (error) {
        test.equal(error.error, 999);
      }));
    },
    logoutStep
    // XXX test Meteor.accounts.config(unsafePasswordChanges)
  ]);

}) ();
