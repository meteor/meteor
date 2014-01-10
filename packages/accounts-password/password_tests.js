Accounts._noConnectionCloseDelayForTest = true;

if (Meteor.isServer) {
  Meteor.methods({
    getUserId: function () {
      return this.userId;
    }
  });
}

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
  var waitForLoggedOutStep = function (test, expect) {
    pollUntil(expect, function () {
      return Meteor.userId() === null;
    }, 10 * 1000, 100);
  };

  testAsyncMulti("passwords - basic login with password", [
    function (test, expect) {
      // setup
      this.username = Random.id();
      this.email = Random.id() + '-intercept@example.com';
      this.password = 'password';

      Accounts.createUser(
        {username: this.username, email: this.email, password: this.password},
        loggedInAs(this.username, test, expect));
    },
    function (test, expect) {
      test.notEqual(Meteor.userId(), null);
    },
    logoutStep,
    function (test, expect) {
      Meteor.loginWithPassword(this.username, this.password,
                               loggedInAs(this.username, test, expect));
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
      Meteor.loginWithPassword(this.username, this.password, expect(function (error) {
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
      Meteor.loginWithPassword({username: this.username}, this.password,
                               loggedInAs(this.username, test, expect));
    },
    logoutStep,
    function (test, expect) {
      Meteor.loginWithPassword(this.email, this.password,
                               loggedInAs(this.username, test, expect));
    },
    logoutStep,
    function (test, expect) {
      Meteor.loginWithPassword({email: this.email}, this.password,
                               loggedInAs(this.username, test, expect));
    },
    logoutStep
  ]);


  testAsyncMulti("passwords - plain text passwords", [
    function (test, expect) {
      // setup
      this.username = Random.id();
      this.email = Random.id() + '-intercept@example.com';
      this.password = 'password';

      // create user with raw password (no API, need to invoke callLoginMethod
      // directly)
      Accounts.callLoginMethod({
        methodName: 'createUser',
        methodArguments: [{username: this.username, password: this.password}],
        userCallback: loggedInAs(this.username, test, expect)
      });
    },
    logoutStep,
    // check can login normally with this password.
    function(test, expect) {
      Meteor.loginWithPassword({username: this.username}, this.password,
                               loggedInAs(this.username, test, expect));
    },
    logoutStep,
    // plain text password. no API for this, have to invoke callLoginMethod
    // directly.
    function (test, expect) {
      Accounts.callLoginMethod({
        // wrong password
        methodArguments: [{user: {username: this.username}, password: 'wrong'}],
        userCallback: expect(function (error) {
          test.isTrue(error);
          test.isFalse(Meteor.user());
        })});
    },
    function (test, expect) {
      Accounts.callLoginMethod({
        // right password
        methodArguments: [{user: {username: this.username},
                           password: this.password}],
        userCallback: loggedInAs(this.username, test, expect)
      });
    },
    logoutStep
  ]);


  testAsyncMulti("passwords - changing passwords", [
    function (test, expect) {
      // setup
      this.username = Random.id();
      this.email = Random.id() + '-intercept@example.com';
      this.password = 'password';
      this.password2 = 'password2';

      Accounts.createUser(
        {username: this.username, email: this.email, password: this.password},
        loggedInAs(this.username, test, expect));
    },
    // change password with bad old password. we stay logged in.
    function (test, expect) {
      var self = this;
      Accounts.changePassword('wrong', 'doesntmatter', expect(function (error) {
        test.isTrue(error);
        test.equal(Meteor.user().username, self.username);
      }));
    },
    // change password with good old password.
    function (test, expect) {
      Accounts.changePassword(this.password, this.password2,
                              loggedInAs(this.username, test, expect));
    },
    logoutStep,
    // old password, failed login
    function (test, expect) {
      Meteor.loginWithPassword(this.email, this.password, expect(function (error) {
        test.isTrue(error);
        test.isFalse(Meteor.user());
      }));
    },
    // new password, success
    function (test, expect) {
      Meteor.loginWithPassword(this.email, this.password2,
                               loggedInAs(this.username, test, expect));
    },
    logoutStep
  ]);


  testAsyncMulti("passwords - new user hooks", [
    function (test, expect) {
      // setup
      this.username = Random.id();
      this.email = Random.id() + '-intercept@example.com';
      this.password = 'password';
    },
    // test Accounts.validateNewUser
    function(test, expect) {
      Accounts.createUser(
        {username: this.username, password: this.password,
         // should fail the new user validators
         profile: {invalid: true}},
        expect(function (error) {
          test.equal(error.error, 403);
          test.equal(error.reason, "User validation failed");
        }));
    },
    logoutStep,
    function(test, expect) {
      Accounts.createUser(
        {username: this.username, password: this.password,
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
        {username: this.username, password: this.password,
         testOnCreateUserHook: true},
        loggedInAs(this.username, test, expect));
    },
    function(test, expect) {
      test.equal(Meteor.user().profile.touchedByOnCreateUser, true);
    },
    logoutStep
  ]);


  testAsyncMulti("passwords - Meteor.user()", [
    function (test, expect) {
      // setup
      this.username = Random.id();
      this.password = 'password';

      Accounts.createUser(
        {username: this.username, password: this.password,
         testOnCreateUserHook: true},
        loggedInAs(this.username, test, expect));
    },
    // test Meteor.user(). This test properly belongs in
    // accounts-base/accounts_tests.js, but this is where the tests that
    // actually log in are.
    function(test, expect) {
      var self = this;
      var clientUser = Meteor.user();
      Accounts.connection.call('testMeteorUser', expect(function (err, result) {
        test.equal(result._id, clientUser._id);
        test.equal(result.username, clientUser.username);
        test.equal(result.username, self.username);
        test.equal(result.profile.touchedByOnCreateUser, true);
        test.equal(err, undefined);
      }));
    },
    function(test, expect) {
      // Test that even with no published fields, we still have a document.
      Accounts.connection.call('clearUsernameAndProfile', expect(function() {
        test.isTrue(Meteor.userId());
        var user = Meteor.user();
        test.equal(user, {_id: Meteor.userId()});
      }));
    },
    logoutStep,
    function(test, expect) {
      var clientUser = Meteor.user();
      test.equal(clientUser, null);
      test.equal(Meteor.userId(), null);
      Accounts.connection.call('testMeteorUser', expect(function (err, result) {
        test.equal(err, undefined);
        test.equal(result, null);
      }));
    }
  ]);

  testAsyncMulti("passwords - allow rules", [
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
      // Can't update fields other than profile.
      Meteor.users.update(
        this.userId, {$set: {disallowed: true, 'profile.updated': 42}},
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
      test.isFalse(_.has(Meteor.user().profile, 'updated'));
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


  testAsyncMulti("passwords - tokens", [
    function (test, expect) {
      // setup
      this.username = Random.id();
      this.password = 'password';

      Accounts.createUser(
        {username: this.username, password: this.password},
        loggedInAs(this.username, test, expect));
    },

    function (test, expect) {
      // we can't login with an invalid token
      var expectLoginError = expect(function (err) {
        test.isTrue(err);
      });
      Meteor.loginWithToken('invalid', expectLoginError);
    },

    function (test, expect) {
      // we can login with a valid token
      var expectLoginOK = expect(function (err) {
        test.isFalse(err);
      });
      Meteor.loginWithToken(Accounts._storedLoginToken(), expectLoginOK);
    },

    function (test, expect) {
      // test logging out invalidates our token
      var expectLoginError = expect(function (err) {
        test.isTrue(err);
      });
      var token = Accounts._storedLoginToken();
      test.isTrue(token);
      Meteor.logout(function () {
        Meteor.loginWithToken(token, expectLoginError);
      });
    },

    function (test, expect) {
      var self = this;
      // Test that login tokens get expired. We should get logged out when a
      // token expires, and not be able to log in again with the same token.
      var expectNoError = expect(function (err) {
        test.isFalse(err);
      });

      Meteor.loginWithPassword(this.username, this.password, function (error) {
        self.token = Accounts._storedLoginToken();
        test.isTrue(self.token);
        expectNoError(error);
        Accounts.connection.call("expireTokens");
      });
    },
    waitForLoggedOutStep,
    function (test, expect) {
      var token = Accounts._storedLoginToken();
      test.isFalse(token);
    },
    function (test, expect) {
      // Test that once expireTokens is finished, we can't login again with our
      // previous token.
      Meteor.loginWithToken(this.token, expect(function (err, result) {
        test.isTrue(err);
        test.equal(Meteor.userId(), null);
      }));
    },
    function (test, expect) {
      var self = this;

      // copied from livedata/client_convenience.js
      self.ddpUrl = '/';
      if (typeof __meteor_runtime_config__ !== "undefined") {
        if (__meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL)
          self.ddpUrl = __meteor_runtime_config__.DDP_DEFAULT_CONNECTION_URL;
      }
      // XXX can we get the url from the existing connection somehow
      // instead?

      // Test that Meteor.logoutOtherClients logs out a second authenticated
      // connection while leaving Accounts.connection logged in.
      var token;
      var userId;
      self.secondConn = DDP.connect(self.ddpUrl);

      var expectLoginError = expect(function (err) {
        test.isTrue(err);
      });
      var expectValidToken = expect(function (err, result) {
        test.isFalse(err);
        test.isTrue(result);
        self.tokenFromLogoutOthers = result.token;
      });
      var expectSecondConnLoggedIn = expect(function (err, result) {
        test.equal(result.token, token);
        test.isFalse(err);
        // This test will fail if an unrelated reconnect triggers before the
        // connection is logged out. In general our tests aren't resilient to
        // mid-test reconnects.
        self.secondConn.onReconnect = function () {
          self.secondConn.call("login", { resume: token }, expectLoginError);
        };
        Accounts.connection.call("logoutOtherClients", expectValidToken);
      });

      Meteor.loginWithPassword(this.username, this.password, expect(function (err) {
        test.isFalse(err);
        token = Accounts._storedLoginToken();
        self.beforeLogoutOthersToken = token;
        test.isTrue(token);
        userId = Meteor.userId();
        self.secondConn.call("login", { resume: token },
                             expectSecondConnLoggedIn);
      }));
    },
    // Test that logoutOtherClients logged out Accounts.connection and that the
    // previous token is no longer valid.
    waitForLoggedOutStep,
    function (test, expect) {
      var self = this;
      var token = Accounts._storedLoginToken();
      test.isFalse(token);
      this.secondConn.close();
      Meteor.loginWithToken(
        self.beforeLogoutOthersToken,
        expect(function (err) {
          test.isTrue(err);
          test.isFalse(Meteor.userId());
        })
      );
    },
    // Test that logoutOtherClients returned a new token that we can use to
    // log in.
    function (test, expect) {
      var self = this;
      Meteor.loginWithToken(
        self.tokenFromLogoutOthers,
        expect(function (err) {
          test.isFalse(err);
          test.isTrue(Meteor.userId());
        })
      );
    },
    logoutStep,
    function (test, expect) {
      var self = this;
      // Test that, when we call logoutOtherClients, if the server disconnects
      // us before the logoutOtherClients callback runs, then we still end up
      // logged in.
      var expectServerLoggedIn = expect(function (err, result) {
        test.isFalse(err);
        test.isTrue(Meteor.userId());
        test.equal(result, Meteor.userId());
      });

      Meteor.loginWithPassword(
        self.username,
        self.password,
        expect(function (err) {
          test.isFalse(err);
          test.isTrue(Meteor.userId());

          // The test is only useful if things interleave in the following order:
          // - logoutOtherClients runs on the server
          // - onReconnect fires and sends a login method with the old token,
          //   which results in an error
          // - logoutOtherClients callback runs and stores the new token and
          //   logs in with it
          // In practice they seem to interleave this way, but I'm not sure how
          // to make sure that they do.

          Meteor.logoutOtherClients(function (err) {
            test.isFalse(err);
            Meteor.call("getUserId", expectServerLoggedIn);
          });
        })
      );
    },
    logoutStep,
    function (test, expect) {
      var self = this;
      // Test that deleting a user logs out that user's connections.
      Meteor.loginWithPassword(this.username, this.password, expect(function (err) {
        test.isFalse(err);
        Accounts.connection.call("removeUser", self.username);
      }));
    },
    waitForLoggedOutStep
  ]);
}) ();


if (Meteor.isServer) (function () {

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
      var username = Random.id();
      test.throws(function () {
        // should fail the new user validators
        Accounts.createUser({username: username, profile: {invalid: true}});
      });

      var userId = Accounts.createUser({username: username,
                                        testOnCreateUserHook: true});

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

  Tinytest.addAsync(
    'passwords - login tokens cleaned up',
    function (test, onComplete) {
      var username = Random.id();
      Accounts.createUser({
        username: username,
        password: 'password'
      });

      makeTestConnection(
        test,
        function (clientConn, serverConn) {
          serverConn.onClose(function () {
            test.isFalse(_.contains(
              Accounts._getTokenConnections(token), serverConn.id));
            onComplete();
          });
          var result = clientConn.call('login', {
            user: {username: username},
            password: 'password'
          });
          test.isTrue(result);
          var token = Accounts._getAccountData(serverConn.id, 'loginToken');
          test.isTrue(token);
          test.isTrue(_.contains(
            Accounts._getTokenConnections(token), serverConn.id));
          clientConn.disconnect();
        },
        onComplete
      );
    }
  );
}) ();
