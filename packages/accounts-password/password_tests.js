Accounts._noConnectionCloseDelayForTest = true;

if (Meteor.isServer) {
  Meteor.methods({
    getUserId: function () {
      return this.userId;
    },
    getResetToken: function () {
      var token = Meteor.users.findOne(this.userId).services.password.reset;
      return token;
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
  var invalidateLoginsStep = function (test, expect) {
    Meteor.call("testInvalidateLogins", 'fail', expect(function (error) {
      test.isFalse(error);
    }));
  };
  var hideActualLoginErrorStep = function (test, expect) {
    Meteor.call("testInvalidateLogins", 'hide', expect(function (error) {
      test.isFalse(error);
    }));
  };
  var validateLoginsStep = function (test, expect) {
    Meteor.call("testInvalidateLogins", false, expect(function (error) {
      test.isFalse(error);
    }));
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
      var handle = Tracker.autorun(function () {
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
        Tracker.flush();
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
    // Send a password reset email so that we can test that password
    // reset tokens get deleted on password change.
    function (test, expect) {
      Meteor.call("forgotPassword", { email: this.email }, expect(function (error) {
        test.isFalse(error);
      }));
    },
    function (test, expect) {
      var self = this;
      Meteor.call("getResetToken", expect(function (err, token) {
        test.isFalse(err);
        test.isTrue(token);
        self.token = token;
      }));
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
    function (test, expect) {
      Meteor.call("getResetToken", expect(function (err, token) {
        test.isFalse(err);
        test.isFalse(token);
      }));
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

  testAsyncMulti("passwords - changing password logs out other clients", [
    function (test, expect) {
      this.username = Random.id();
      this.email = Random.id() + '-intercept@example.com';
      this.password = 'password';
      this.password2 = 'password2';
      Accounts.createUser(
        { username: this.username, email: this.email, password: this.password },
        loggedInAs(this.username, test, expect));
    },
    // Log in a second connection as this user.
    function (test, expect) {
      var self = this;

      self.secondConn = DDP.connect(Meteor.absoluteUrl());
      self.secondConn.call('login',
                { user: { username: self.username }, password: self.password },
                expect(function (err, result) {
                  test.isFalse(err);
                  self.secondConn.setUserId(result.id);
                  test.isTrue(self.secondConn.userId());

                  self.secondConn.onReconnect = function () {
                    self.secondConn.apply(
                      'login',
                      [{ resume: result.token }],
                      { wait: true },
                      function (err, result) {
                        self.secondConn.setUserId(result && result.id || null);
                      }
                    );
                  };
                }));
    },
    function (test, expect) {
      var self = this;
      Accounts.changePassword(self.password, self.password2, expect(function (err) {
        test.isFalse(err);
      }));
    },
    // Now that we've changed the password, wait until the second
    // connection gets logged out.
    function (test, expect) {
      var self = this;
      pollUntil(expect, function () {
        return self.secondConn.userId() === null;
      }, 10 * 1000, 100);
    }
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
    logoutStep,
    function (test, expect) {
      var self = this;
      // Test that Meteor.logoutOtherClients logs out a second
      // authentcated connection while leaving Accounts.connection
      // logged in.
      var secondConn = DDP.connect(Meteor.absoluteUrl());
      var token;

      var expectSecondConnLoggedOut = expect(function (err, result) {
        test.isTrue(err);
      });

      var expectAccountsConnLoggedIn = expect(function (err, result) {
        test.isFalse(err);
      });

      var expectSecondConnLoggedIn = expect(function (err, result) {
        test.equal(result.token, token);
        test.isFalse(err);
        Meteor.logoutOtherClients(function (err) {
          test.isFalse(err);
          secondConn.call('login', { resume: token },
                          expectSecondConnLoggedOut);
          Accounts.connection.call('login', {
            resume: Accounts._storedLoginToken()
          }, expectAccountsConnLoggedIn);
        });
      });

      Meteor.loginWithPassword(
        self.username,
        self.password,
        expect(function (err) {
          test.isFalse(err);
          token = Accounts._storedLoginToken();
          test.isTrue(token);
          secondConn.call('login', { resume: token },
                          expectSecondConnLoggedIn);
        })
      );
    },
    logoutStep,

    // The tests below this point are for the deprecated
    // `logoutOtherClients` method.

    function (test, expect) {
      var self = this;

      // Test that Meteor.logoutOtherClients logs out a second authenticated
      // connection while leaving Accounts.connection logged in.
      var token;
      self.secondConn = DDP.connect(Meteor.absoluteUrl());

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
      // Test that deleting a user logs out that user's connections.
      Meteor.loginWithPassword(this.username, this.password, expect(function (err) {
        test.isFalse(err);
        Accounts.connection.call("removeUser", self.username);
      }));
    },
    waitForLoggedOutStep
  ]);

  testAsyncMulti("passwords - validateLoginAttempt", [
    function (test, expect) {
      this.username = Random.id();
      this.password = "password";

      Accounts.createUser(
        {username: this.username, password: this.password},
        loggedInAs(this.username, test, expect));
    },
    logoutStep,
    invalidateLoginsStep,
    function (test, expect) {
      Meteor.loginWithPassword(
        this.username,
        this.password,
        expect(function (error) {
          test.isTrue(error);
          test.equal(error.reason, "Login forbidden");
        })
      );
    },
    validateLoginsStep,
    function (test, expect) {
      Meteor.loginWithPassword(
        "no such user",
        "some password",
        expect(function (error) {
          test.isTrue(error);
          test.equal(error.reason, 'User not found');
        })
      );
    },
    hideActualLoginErrorStep,
    function (test, expect) {
      Meteor.loginWithPassword(
        "no such user",
        "some password",
        expect(function (error) {
          test.isTrue(error);
          test.equal(error.reason, 'hide actual error');
        })
      );
    },
    validateLoginsStep
  ]);

  testAsyncMulti("passwords - server onLogin hook", [
    function (test, expect) {
      Meteor.call("testCaptureLogins", expect(function (error) {
        test.isFalse(error);
      }));
    },
    function (test, expect) {
      this.username = Random.id();
      this.password = "password";

      Accounts.createUser(
        {username: this.username, password: this.password},
        loggedInAs(this.username, test, expect));
    },
    function (test, expect) {
      var self = this;
      Meteor.call("testFetchCapturedLogins", expect(function (error, logins) {
        test.isFalse(error);
        test.equal(logins.length, 1);
        var login = logins[0];
        test.isTrue(login.successful);
        var attempt = login.attempt;
        test.equal(attempt.type, "password");
        test.isTrue(attempt.allowed);
        test.equal(attempt.methodArguments[0].username, self.username);
      }));
    }
  ]);

  testAsyncMulti("passwords - client onLogin hook", [
    function (test, expect) {
      var self = this;
      this.username = Random.id();
      this.password = "password";
      this.attempt = false;

      this.onLogin = Accounts.onLogin(function (attempt) {
        self.attempt = true;
      });

      Accounts.createUser(
        {username: this.username, password: this.password},
        loggedInAs(this.username, test, expect));
    },
    function (test, expect) {
      this.onLogin.stop();
      test.isTrue(this.attempt);
      expect(function () {})();
    }
  ]);

  testAsyncMulti("passwords - server onLoginFailure hook", [
    function (test, expect) {
      this.username = Random.id();
      this.password = "password";

      Accounts.createUser(
        {username: this.username, password: this.password},
        loggedInAs(this.username, test, expect));
    },
    logoutStep,
    function (test, expect) {
      Meteor.call("testCaptureLogins", expect(function (error) {
        test.isFalse(error);
      }));
    },
    function (test, expect) {
      Meteor.loginWithPassword(this.username, "incorrect", expect(function (error) {
        test.isTrue(error);
      }));
    },
    function (test, expect) {
      Meteor.call("testFetchCapturedLogins", expect(function (error, logins) {
        test.isFalse(error);
        test.equal(logins.length, 1);
        var login = logins[0];
        test.isFalse(login.successful);
        var attempt = login.attempt;
        test.equal(attempt.type, "password");
        test.isFalse(attempt.allowed);
        test.equal(attempt.error.reason, "Incorrect password");
      }));
    },
    function (test, expect) {
      Meteor.call("testCaptureLogins", expect(function (error) {
        test.isFalse(error);
      }));
    },
    function (test, expect) {
      Meteor.loginWithPassword("no such user", "incorrect", expect(function (error) {
        test.isTrue(error);
      }));
    },
    function (test, expect) {
      Meteor.call("testFetchCapturedLogins", expect(function (error, logins) {
        test.isFalse(error);
        test.equal(logins.length, 1);
        var login = logins[0];
        test.isFalse(login.successful);
        var attempt = login.attempt;
        test.equal(attempt.type, "password");
        test.isFalse(attempt.allowed);
        test.equal(attempt.error.reason, "User not found");
      }));
    }
  ]);

  testAsyncMulti("passwords - client onLoginFailure hook", [
    function (test, expect) {
      var self = this;
      this.username = Random.id();
      this.password = "password";
      this.attempt = false;

      this.onLoginFailure = Accounts.onLoginFailure(function () {
        self.attempt = true;
      })

      Accounts.createUser(
        {username: this.username, password: this.password},
        loggedInAs(this.username, test, expect));
    },
    logoutStep,
    function (test, expect) {
      Meteor.call("testCaptureLogins", expect(function (error) {
        test.isFalse(error);
      }));
    },
    function (test, expect) {
      Meteor.loginWithPassword(this.username, "incorrect", expect(function (error) {
        test.isTrue(error);
      }));
    },
    function (test, expect) {
      this.onLoginFailure.stop();
      test.isTrue(this.attempt);
      expect(function () {})();
    }
  ]);

  testAsyncMulti("passwords - srp to bcrypt upgrade", [
    logoutStep,
    // Create user with old SRP credentials in the database.
    function (test, expect) {
      var self = this;
      Meteor.call("testCreateSRPUser", expect(function (error, result) {
        test.isFalse(error);
        self.username = result;
      }));
    },
    // We are able to login with the old style credentials in the database.
    function (test, expect) {
      Meteor.loginWithPassword(this.username, 'abcdef', expect(function (error) {
        test.isFalse(error);
      }));
    },
    function (test, expect) {
      Meteor.call("testSRPUpgrade", this.username, expect(function (error) {
        test.isFalse(error);
      }));
    },
    logoutStep,
    // After the upgrade to bcrypt we're still able to login.
    function (test, expect) {
      Meteor.loginWithPassword(this.username, 'abcdef', expect(function (error) {
        test.isFalse(error);
      }));
    },
    logoutStep,
    function (test, expect) {
      Meteor.call("removeUser", this.username, expect(function (error) {
        test.isFalse(error);
      }));
    }
  ]);

  testAsyncMulti("passwords - srp to bcrypt upgrade via password change", [
    logoutStep,
    // Create user with old SRP credentials in the database.
    function (test, expect) {
      var self = this;
      Meteor.call("testCreateSRPUser", expect(function (error, result) {
        test.isFalse(error);
        self.username = result;
      }));
    },
    // Log in with the plaintext password handler, which should NOT upgrade us to bcrypt.
    function (test, expect) {
      Accounts.callLoginMethod({
        methodName: "login",
        methodArguments: [ { user: { username: this.username }, password: "abcdef" } ],
        userCallback: expect(function (err) {
          test.isFalse(err);
        })
      });
    },
    function (test, expect) {
      Meteor.call("testNoSRPUpgrade", this.username, expect(function (error) {
        test.isFalse(error);
      }));
    },
    // Changing our password should upgrade us to bcrypt.
    function (test, expect) {
      Accounts.changePassword("abcdef", "abcdefg", expect(function (error) {
        test.isFalse(error);
      }));
    },
    function (test, expect) {
      Meteor.call("testSRPUpgrade", this.username, expect(function (error) {
        test.isFalse(error);
      }));
    },
    // And after the upgrade we should be able to change our password again.
    function (test, expect) {
      Accounts.changePassword("abcdefg", "abcdef", expect(function (error) {
        test.isFalse(error);
      }));
    },
    logoutStep
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
      var email = username + '-intercept@example.com';

      var userId = Accounts.createUser({username: username, email: email});

      var user = Meteor.users.findOne(userId);
      // no services yet.
      test.equal(user.services.password, undefined);

      // set a new password.
      Accounts.setPassword(userId, 'new password');
      user = Meteor.users.findOne(userId);
      var oldSaltedHash = user.services.password.bcrypt;
      test.isTrue(oldSaltedHash);

      // Send a reset password email (setting a reset token) and insert a login
      // token.
      Accounts.sendResetPasswordEmail(userId, email);
      Accounts._insertLoginToken(userId, Accounts._generateStampedLoginToken());
      test.isTrue(Meteor.users.findOne(userId).services.password.reset);
      test.isTrue(Meteor.users.findOne(userId).services.resume.loginTokens);

      // reset with the same password, see we get a different salted hash
      Accounts.setPassword(userId, 'new password', {logout: false});
      user = Meteor.users.findOne(userId);
      var newSaltedHash = user.services.password.bcrypt;
      test.isTrue(newSaltedHash);
      test.notEqual(oldSaltedHash, newSaltedHash);
      // No more reset token.
      test.isFalse(Meteor.users.findOne(userId).services.password.reset);
      // But loginTokens are still here since we did logout: false.
      test.isTrue(Meteor.users.findOne(userId).services.resume.loginTokens);

      // reset again, see that the login tokens are gone.
      Accounts.setPassword(userId, 'new password');
      user = Meteor.users.findOne(userId);
      var newerSaltedHash = user.services.password.bcrypt;
      test.isTrue(newerSaltedHash);
      test.notEqual(oldSaltedHash, newerSaltedHash);
      test.notEqual(newSaltedHash, newerSaltedHash);
      // No more tokens.
      test.isFalse(Meteor.users.findOne(userId).services.password.reset);
      test.isFalse(Meteor.users.findOne(userId).services.resume.loginTokens);

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
    'passwords - login token observes get cleaned up',
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
            test.isFalse(Accounts._getUserObserve(serverConn.id));
            onComplete();
          });
          var result = clientConn.call('login', {
            user: {username: username},
            password: 'password'
          });
          test.isTrue(result);
          var token = Accounts._getAccountData(serverConn.id, 'loginToken');
          test.isTrue(token);

          // We poll here, instead of just checking `_getUserObserve`
          // once, because the login method defers the creation of the
          // observe, and setting up the observe yields, so we could end
          // up here before the observe has been set up.
          simplePoll(
            function () {
              return !! Accounts._getUserObserve(serverConn.id);
            },
            function () {
              test.isTrue(Accounts._getUserObserve(serverConn.id));
              clientConn.disconnect();
            },
            function () {
              test.fail("timed out waiting for user observe for connection " +
                        serverConn.id);
              onComplete();
            }
          );
        },
        onComplete
      );
    }
  );
}) ();
