Accounts.config({
  _connectionCloseDelay: 0
});

if (Meteor.isClient) (function () {

  // XXX note, only one test can do login/logout things at once! for
  // now, that is this test.

  Accounts._isolateLoginTokenForTest();

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

  // declare variable outside the testAsyncMulti, so we can refer to
  // them from multiple tests, but initialize them to new values inside
  // the test so when we use the 'debug' link in the tests, they get new
  // values and the tests don't fail.
  var username, username2, username3;
  var userId1, userId3;
  var email;
  var password, password2, password3;

  testAsyncMulti("passwords - long series", [
    function (test, expect) {
      username = Random.id();
      username2 = Random.id();
      username3 = Random.id();
      // use -intercept so that we don't print to the console
      email = Random.id() + '-intercept@example.com';
      password = 'password';
      password2 = 'password2';
      password3 = 'password3';
    },
    function (test, expect) {
      Accounts.createUser(
        {username: username, email: email, password: password},
        loggedInAs(username, test, expect));
    },
    function (test, expect) {
      userId1 = Meteor.userId();
      test.notEqual(userId1, null);
    },
    logoutStep,
    function (test, expect) {
      Meteor.loginWithPassword(username, password,
                               loggedInAs(username, test, expect));
    },
    logoutStep,
    // This next step tests reactive contexts which are reactive on
    // Meteor.user().
    function (test, expect) {
      // Set up a reactive context that only refreshes when Meteor.user() is
      // invalidated.
      var loaded = false;
      var handle = Deps.autorun(function () {
        if (Meteor.user() && Meteor.user().emails)
          loaded = true;
      });
      // At the beginning, we're not logged in.
      test.isFalse(loaded);
      Meteor.loginWithPassword(username, password, expect(function (error) {
        test.equal(error, undefined);
        test.notEqual(Meteor.userId(), null);
        // By the time of the login callback, the user should be loaded.
        test.isTrue(Meteor.user().emails);
        // Flushing should get us the rerun as well.
        Deps.flush();
        test.isTrue(loaded);
        handle.stop();
      }));
    },
    logoutStep,
    function (test, expect) {
      Meteor.loginWithPassword({username: username}, password,
                               loggedInAs(username, test, expect));
    },
    logoutStep,
    function (test, expect) {
      Meteor.loginWithPassword(email, password,
                               loggedInAs(username, test, expect));
    },
    logoutStep,
    function (test, expect) {
      Meteor.loginWithPassword({email: email}, password,
                               loggedInAs(username, test, expect));
    },
    logoutStep,
    // plain text password. no API for this, have to invoke callLoginMethod
    // directly.
    function (test, expect) {
      Accounts.callLoginMethod({
        // wrong password
        methodArguments: [{user: {email: email}, password: password2}],
        userCallback: expect(function (error) {
          test.isTrue(error);
          test.isFalse(Meteor.user());
        })});
    },
    function (test, expect) {
      Accounts.callLoginMethod({
        // right password
        methodArguments: [{user: {email: email}, password: password}],
        userCallback: loggedInAs(username, test, expect)
      });
    },
    // change password with bad old password. we stay logged in.
    function (test, expect) {
      Accounts.changePassword(password2, password2, expect(function (error) {
        test.isTrue(error);
        test.equal(Meteor.user().username, username);
      }));
    },
    // change password with good old password.
    function (test, expect) {
      Accounts.changePassword(password, password2,
                              loggedInAs(username, test, expect));
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
      Meteor.loginWithPassword(email, password2,
                               loggedInAs(username, test, expect));
    },
    logoutStep,
    // create user with raw password (no API, need to invoke callLoginMethod
    // directly)
    function (test, expect) {
      Accounts.callLoginMethod({
        methodName: 'createUser',
        methodArguments: [{username: username2, password: password2}],
        userCallback: loggedInAs(username2, test, expect)
      });
    },
    logoutStep,
    function(test, expect) {
      Meteor.loginWithPassword({username: username2}, password2,
                               loggedInAs(username2, test, expect));
    },
    logoutStep,
    // test Accounts.validateNewUser
    function(test, expect) {
      Accounts.createUser({username: username3, password: password3,
                           // should fail the new user validators
                           profile: {invalid: true}},
                          expect(function (error) {
                            test.equal(error.error, 403);
                            test.equal(
                              error.reason,
                              "User validation failed");
                          }));
    },
    logoutStep,
    function(test, expect) {
      Accounts.createUser({username: username3, password: password3,
                           // should fail the new user validator with a special
                           // exception
                           profile: {invalidAndThrowException: true}},
                        expect(function (error) {
                          test.equal(
                            error.reason,
                            "An exception thrown within Accounts.validateNewUser");
                        }));
    },
    // test Accounts.onCreateUser
    function(test, expect) {
      Accounts.createUser(
        {username: username3, password: password3,
         testOnCreateUserHook: true},
        loggedInAs(username3, test, expect));
    },
    function(test, expect) {
      test.equal(Meteor.user().profile.touchedByOnCreateUser, true);
    },
    // test Meteor.user(). This test properly belongs in
    // accounts-base/accounts_tests.js, but this is where the tests that
    // actually log in are.
    function(test, expect) {
      var clientUser = Meteor.user();
      Meteor.call('testMeteorUser', expect(function (err, result) {
        test.equal(result._id, clientUser._id);
        test.equal(result.profile.touchedByOnCreateUser, true);
        test.equal(err, undefined);
      }));
    },
    // test the default Meteor.users allow rule. This test properly belongs in
    // accounts-base/accounts_tests.js, but this is where the tests that
    // actually log in are.
    function(test, expect) {
      userId3 = Meteor.userId();
      test.notEqual(userId3, null);
      // Can't update fields other than profile.
      Meteor.users.update(
        userId3, {$set: {disallowed: true, 'profile.updated': 42}},
        expect(function (err) {
          test.isTrue(err);
          test.equal(err.error, 403);
          test.isFalse(_.has(Meteor.user(), 'disallowed'));
          test.isFalse(_.has(Meteor.user().profile, 'updated'));
        }));
    },
    function(test, expect) {
      // Can't update another user.
      Meteor.users.update(
        userId1, {$set: {'profile.updated': 42}},
        expect(function (err) {
          test.isTrue(err);
          test.equal(err.error, 403);
        }));
    },
    function(test, expect) {
      // Can't update using a non-ID selector. (This one is thrown client-side.)
      test.throws(function () {
        Meteor.users.update(
          {username: username3}, {$set: {'profile.updated': 42}});
      });
      test.isFalse(_.has(Meteor.user().profile, 'updated'));
    },
    function(test, expect) {
      // Can update own profile using ID.
      Meteor.users.update(
        userId3, {$set: {'profile.updated': 42}},
        expect(function (err) {
          test.isFalse(err);
          test.equal(42, Meteor.user().profile.updated);
        }));
    },
    function(test, expect) {
      // Test that even with no published fields, we still have a document.
      Meteor.call('clearUsernameAndProfile', expect(function() {
        test.isTrue(Meteor.userId());
        var user = Meteor.user();
        test.equal(user, {_id: Meteor.userId()});
      }));
    },
    logoutStep,
    function(test, expect) {
      var clientUser = Meteor.user();
      test.equal(clientUser, null);
      Meteor.call('testMeteorUser', expect(function (err, result) {
        test.equal(err, undefined);
        test.equal(result, null);
      }));
    },
    logoutStep,
    function(test, expect) {
      var expectLoginError = expect(function (err) {
        test.isTrue(err);
      });
      Meteor.loginWithPassword(username, password2, function (error) {
        test.equal(error, undefined);
        test.equal(Meteor.user().username, username);
        var token = Accounts._storedLoginToken();
        Meteor.logout(function () {
          Meteor.loginWithToken(token, expectLoginError);
        });
      });
    },
    logoutStep,
    function(test, expect) {
      // Test that login tokens get expired. We should get logged out when a
      // token expires, and not be able to log in again with the same token.
      var expectLoggedOut = expect(function () {
        test.equal(Meteor.user(), null);
      });
      var expectLoginError = expect(function (err) {
        test.isTrue(err);
      });
      var expectNoError = expect(function (err) {
        test.isFalse(err);
      });
      var token;
      var firstLoginCallback = true;
      Meteor.loginWithPassword(username, password2, function (error) {
        // callback will be called again on reconnect after our token gets
        // expired.
        if (firstLoginCallback) {
          token = Accounts._storedLoginToken();
          test.isTrue(token);
          test.isFalse(error);
          Meteor.call("expireTokens", new Date(), function (error, result) {
            expectNoError(error);
          });
        } else {
          expectLoggedOut();
          Meteor.loginWithToken(token, function (err) {
            test.isFalse(Meteor.userId());
            expectLoginError(err);
          });
        }
        firstLoginCallback = false;
      });
    },
    logoutStep,
    function (test, expect) {
      // Test that Meteor._logoutAllOthers logs out a second authenticated
      // connection.

      var expectNoError = expect(function (err) {
        test.isFalse(err);
      });
      var expectSecondConnLoggedOut = expect(function () {
        test.isFalse(secondConn.userId());
      });
      var expectLoginError = expect(function (err) {
        test.isTrue(err);
      });

      var token;

      // copied from livedata/client_convenience.js
      var ddpUrl = '/';
      if (typeof __meteor_runtime_config__ !== "undefined") {
        if (__meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL)
          ddpUrl = __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL;
      }
      var secondConn = DDP.connect(ddpUrl);

      var firstLoginCallback = true;

      secondConn.onReconnect = function () {
        expectSecondConnLoggedOut();
        secondConn.call("login", { resume: token }, function (err, result) {
          test.isFalse(secondConn.userId());
          expectLoginError(err);
        });
      };

      Meteor.loginWithPassword(username, password2, function (err, result) {
        test.isFalse(err);
        if (firstLoginCallback) {
          test.isTrue(Meteor.user());
          token = Accounts._storedLoginToken();
          secondConn.call("login", {
            resume: token
          }, function (err, result) {
            test.isFalse(err);
            Meteor._logoutAllOthers(function (err) {
              expectNoError(err);
            });
          });
        } else {
          // Callback fires again after reconnect. We should still be logged in,
          // but secondConn should be logged out and subsequently fail resume
          // login.
          test.isFalse(err);
          test.isTrue(Meteor.user());
        }
        firstLoginCallback = false;
      });
    },
    logoutStep,
    function (test, expect) {
      // Test that deleting a user logs out that user's connections.
      var expectLoginError = expect(function (err) {
        test.isTrue(err);
      });
      var firstLoginCallback = true;
      Meteor.loginWithPassword(username, password2, function (err) {
        if (firstLoginCallback) {
          test.isFalse(err);
          Meteor.call("removeUser", username);
        } else {
          expectLoginError(err);
        }
        firstLoginCallback = false;
      });
    }
  ]);

}) ();


if (Meteor.isServer) (function () {

  Meteor.methods({
    expireTokens: function (oldestValidDate) {
      Accounts._expireTokens(oldestValidDate);
    },
    removeUser: function (username) {
      Meteor.users.remove({ "username": username });
    }
  });

  Tinytest.add(
    'passwords - setup more than one onCreateUserHook',
    function (test) {
      test.throws(function() {
        Accounts.onCreateUser(function () {});
      });
    });


  Tinytest.add(
    'passwords - createUser hooks',
    function (test) {
      var email = Random.id() + '@example.com';
      test.throws(function () {
        // should fail the new user validators
        Accounts.createUser({email: email, profile: {invalid: true}});
        });

      // disable sending emails
      var oldEmailSend = Email.send;
      Email.send = function() {};
      var userId = Accounts.createUser({email: email,
                                        testOnCreateUserHook: true});
      Email.send = oldEmailSend;

      test.isTrue(userId);
      var user = Meteor.users.findOne(userId);
      test.equal(user.profile.touchedByOnCreateUser, true);
    });


  Tinytest.add(
    'passwords - setPassword',
    function (test) {
      var username = Random.id();

      var userId = Accounts.createUser({username: username});

      var user = Meteor.users.findOne(userId);
      // no services yet.
      test.equal(user.services.password, undefined);

      // set a new password.
      Accounts.setPassword(userId, 'new password');
      user = Meteor.users.findOne(userId);
      var oldVerifier = user.services.password.srp;
      test.isTrue(user.services.password.srp);

      // reset with the same password, see we get a different verifier
      Accounts.setPassword(userId, 'new password');
      user = Meteor.users.findOne(userId);
      var newVerifier = user.services.password.srp;
      test.notEqual(oldVerifier.salt, newVerifier.salt);
      test.notEqual(oldVerifier.identity, newVerifier.identity);
      test.notEqual(oldVerifier.verifier, newVerifier.verifier);

      // cleanup
      Meteor.users.remove(userId);
    });


  // This test properly belongs in accounts-base/accounts_tests.js, but
  // this is where the tests that actually log in are.
  Tinytest.add('accounts - user() out of context', function (test) {
    // basic server context, no method.
    test.throws(function () {
      Meteor.user();
    });
  });

  // XXX would be nice to test Accounts.config({forbidClientAccountCreation: true})
}) ();
