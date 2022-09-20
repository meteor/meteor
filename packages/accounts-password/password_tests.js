Accounts._connectionCloseDelayMsForTests = 1000;

function hashPassword(password) {
  return {
    digest: SHA256(password),
      algorithm: "sha-256"
  };
}

if (Meteor.isServer) {
  Accounts.removeDefaultRateLimit();

  Meteor.methods({
    getResetToken: function () {
      const token = Meteor.users.findOne(this.userId).services.password.reset;
      return token;
    },
    addSkipCaseInsensitiveChecksForTest: value => {
      Accounts._skipCaseInsensitiveChecksForTest[value] = true;
    },
    removeSkipCaseInsensitiveChecksForTest: value => {
      delete Accounts._skipCaseInsensitiveChecksForTest[value];
    },
    countUsersOnServer: query => Meteor.users.find(query).count(),
  });
}

if (Meteor.isClient) (() => {

  // XXX note, only one test can do login/logout things at once! for
  // now, that is this test.

  Accounts._isolateLoginTokenForTest();

  const addSkipCaseInsensitiveChecksForTest = (value, test, expect) =>
    Meteor.call('addSkipCaseInsensitiveChecksForTest', value);

  const removeSkipCaseInsensitiveChecksForTest = (value, test, expect) =>
    Meteor.call('removeSkipCaseInsensitiveChecksForTest', value);

  const createUserStep = function (test, expect) {
    // Hack because Tinytest does not clean the database between tests/runs
    this.randomSuffix = Random.id(10);
    this.username = `AdaLovelace${this.randomSuffix}`;
    this.email =  `Ada-intercept@lovelace.com${this.randomSuffix}`;
    this.password = 'password';
    Accounts.createUser(
      {username: this.username, email: this.email, password: this.password},
      loggedInAs(this.username, test, expect));
  };
  const logoutStep = (test, expect) =>
    Meteor.logout(expect(error => {
      if (error) {
        test.fail(error.message);
      }
      test.equal(Meteor.user(), null);
    }));
  const loggedInAs = (someUsername, test, expect) => {
    return expect(error => {
      if (error) {
        test.fail(error.message);
      }
      test.equal(Meteor.userId() && Meteor.user().username, someUsername);
    });
  };
  const loggedInUserHasEmail = (someEmail, test, expect) => {
    return expect(error => {
      if (error) {
        test.fail(error.message);
      }
      const user = Meteor.user();
      test.isTrue(user && user.emails.reduce(
        (prev, email) => prev || email.address === someEmail,
        false
      ));
    });
  };
  const expectError = (expectedError, test, expect) => expect(actualError => {
    test.equal(actualError && actualError.error, expectedError.error);
    test.equal(actualError && actualError.reason, expectedError.reason);
  });
  const expectUserNotFound = (test, expect) =>
    expectError(new Meteor.Error(403, "User not found"), test, expect);
  const waitForLoggedOutStep = (test, expect) => pollUntil(
    expect,
    () => Meteor.userId() === null,
    10 * 1000,
    100
  );
  const invalidateLoginsStep = (test, expect) =>
    Meteor.call("testInvalidateLogins", 'fail', expect(error => {
      if (error) {
        test.fail(error.message);
      }
    }));
  const hideActualLoginErrorStep = (test, expect) =>
    Meteor.call("testInvalidateLogins", 'hide', expect(error => {
      if (error) {
        test.fail(error.message);
      }
    }));
  const validateLoginsStep = (test, expect) =>
    Meteor.call("testInvalidateLogins", false, expect(error => {
      if (error) {
        test.fail(error.message);
      }
    }));

  testAsyncMulti("passwords - basic login with password", [
    function (test, expect) {
      // setup
      this.username = Random.id();
      this.email = `${Random.id()}-intercept@example.com`;
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
      let loaded = false;
      const handle = Tracker.autorun(() => {
        if (Meteor.user() && Meteor.user().emails)
          loaded = true;
      });
      // At the beginning, we're not logged in.
      test.isFalse(loaded);
      Meteor.loginWithPassword(this.username, this.password, expect(error => {
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

  testAsyncMulti("passwords - logging in with case insensitive username", [
    createUserStep,
    logoutStep,
    // We should be able to log in with the username in lower case
    function (test, expect) {
      Meteor.loginWithPassword(
        { username: `adalovelace${this.randomSuffix}` },
        this.password,
        loggedInAs(this.username, test, expect));
    }
  ]);

  testAsyncMulti("passwords - logging in with case insensitive username " +
      "with non-ASCII characters", [
    function (test, expect) {
      // Hack because Tinytest does not clean the database between tests/runs
      this.randomSuffix = Random.id(10);
      this.username = `ÁdaLØvela😈e${this.randomSuffix}`;
      this.password = 'password';
      Accounts.createUser(
        {username: this.username, email: this.email, password: this.password},
        loggedInAs(this.username, test, expect));
    },
    logoutStep,
    // We should be able to log in with the username in lower case
    function (test, expect) {
      Meteor.loginWithPassword(
        { username: `ádaløvela😈e${this.randomSuffix}` },
        this.password,
        loggedInAs(this.username, test, expect));
    }
  ]);

  testAsyncMulti("passwords - logging in with case insensitive username " +
      "should escape regex special characters", [
    createUserStep,
    logoutStep,
    // We shouldn't be able to log in with a regex expression for the username
    function (test, expect) {
      Meteor.loginWithPassword(
        { username: `.+${this.randomSuffix}` },
        this.password,
        expectUserNotFound(test, expect));
    }
  ]);

  testAsyncMulti("passwords - logging in with case insensitive username " +
     "should require a match of the full string", [
    createUserStep,
    logoutStep,
    // We shouldn't be able to log in with a partial match for the username
    function (test, expect) {
      Meteor.loginWithPassword(
        { username: `lovelace${this.randomSuffix}` },
        this.password,
        expectUserNotFound(test, expect));
    }
  ]);

  testAsyncMulti("passwords - logging in with case insensitive username when " +
      "there are multiple matches", [
    createUserStep,
    logoutStep,
    function (test, expect) {
      this.otherUsername = `Adalovelace${this.randomSuffix}`;
      addSkipCaseInsensitiveChecksForTest(this.otherUsername, test, expect);
    },
    // Create another user with a username that only differs in case
    function (test, expect) {
      Accounts.createUser(
        { username: this.otherUsername, password: this.password },
        loggedInAs(this.otherUsername, test, expect));
    },
    function (test, expect) {
      removeSkipCaseInsensitiveChecksForTest(this.otherUsername, test, expect);
    },
    // We shouldn't be able to log in with the username in lower case
    function (test, expect) {
      Meteor.loginWithPassword(
        { username: `adalovelace${this.randomSuffix}` },
        this.password,
        expectUserNotFound(test, expect));
    },
    // We should still be able to log in with the username in original case
    function (test, expect) {
      Meteor.loginWithPassword(
        { username: this.username },
        this.password,
        loggedInAs(this.username, test, expect));
    }
  ]);

  testAsyncMulti("passwords - creating users with the same case insensitive " +
      "username", [
    createUserStep,
    logoutStep,
    // Attempting to create another user with a username that only differs in
    // case should fail
    function (test, expect) {
      this.newUsername = `adalovelace${this.randomSuffix}`;
      Accounts.createUser(
        { username: this.newUsername, password: this.password },
        expectError(
          new Meteor.Error(403, "Username already exists."),
          test,
          expect));
    },
    // Make sure the new user has not been inserted
    function (test, expect) {
      Meteor.call('countUsersOnServer',
        { username: this.newUsername },
        expect(function (error, result) {
          test.equal(result, 0);
      }));
    }
  ]);

  testAsyncMulti("passwords - logging in with case insensitive email", [
    createUserStep,
    logoutStep,
    // We should be able to log in with the email in lower case
    function (test, expect) {
      Meteor.loginWithPassword(
        { email: `ada-intercept@lovelace.com${this.randomSuffix}` },
        this.password,
        loggedInAs(this.username, test, expect));
    }
  ]);

  testAsyncMulti("passwords - logging in with case insensitive email should " +
      "escape regex special characters", [
    createUserStep,
    logoutStep,
    // We shouldn't be able to log in with a regex expression for the email
    function (test, expect) {
      Meteor.loginWithPassword(
        { email: `.+${this.randomSuffix}` },
        this.password,
        expectUserNotFound(test, expect));
    }
  ]);

  testAsyncMulti("passwords - logging in with case insensitive email should " +
     "require a match of the full string", [
    createUserStep,
    logoutStep,
    // We shouldn't be able to log in with a partial match for the email
    function (test, expect) {
      Meteor.loginWithPassword(
        { email: `com${this.randomSuffix}` },
        this.password,
        expectUserNotFound(test, expect));
    }
  ]);

  testAsyncMulti("passwords - logging in with case insensitive email when " +
      "there are multiple matches", [
    createUserStep,
    logoutStep,
    function (test, expect) {
      this.otherUsername = `AdaLovelace${Random.id(10)}`;
      this.otherEmail = `ADA-intercept@lovelace.com${this.randomSuffix}`;
      addSkipCaseInsensitiveChecksForTest(this.otherEmail, test, expect);
    },
    // Create another user with an email that only differs in case
    function (test, expect) {
      Accounts.createUser(
        { username: this.otherUsername,
          email: this.otherEmail,
          password: this.password },
        loggedInAs(this.otherUsername, test, expect));
    },
    function (test, expect) {
      removeSkipCaseInsensitiveChecksForTest(this.otherUsername, test, expect);
    },
    logoutStep,
    // We shouldn't be able to log in with the email in lower case
    function (test, expect) {
      Meteor.loginWithPassword(
        { email: `ada-intercept@lovelace.com${this.randomSuffix}` },
        this.password,
        expectUserNotFound(test, expect));
    },
    // We should still be able to log in with the email in original case
    function (test, expect) {
      Meteor.loginWithPassword(
        { email: this.email },
        this.password,
        loggedInAs(this.username, test, expect));
    }
  ]);

  testAsyncMulti("passwords - creating users with the same case insensitive " +
      "email", [
    createUserStep,
    logoutStep,
    // Create user error without callback should throw error
    function (test, expect) {
      this.newUsername = `adalovelace${this.randomSuffix}`;
      test.throws(function(){
        Accounts.createUser({ username: this.newUsername, password: '' });
      }, /Password may not be empty/);
    },
    // Attempting to create another user with an email that only differs in
    // case should fail
    function (test, expect) {
      this.newEmail = `ada-intercept@lovelace.com${this.randomSuffix}`;
      Accounts.createUser(
        { email: this.newEmail, password: this.password },
        expectError(
          new Meteor.Error(403, "Email already exists."),
          test,
          expect));
    },
    // Make sure the new user has not been inserted
    function (test, expect) {
      Meteor.call('countUsersOnServer',
        { 'emails.address': this.newEmail },
        expect (function (error, result) {
          test.equal(result, 0);
        })
      );
    }
  ]);

  testAsyncMulti("passwords - changing passwords", [
    function (test, expect) {
      // setup
      this.username = Random.id();
      this.email = `${Random.id()}-intercept@example.com`;
      this.password = 'password';
      this.password2 = 'password2';

      Accounts.createUser(
        { username: this.username, email: this.email, password: this.password },
        loggedInAs(this.username, test, expect));
    },
    // Send a password reset email so that we can test that password
    // reset tokens get deleted on password change.
    function (test, expect) {
      Meteor.call("forgotPassword",
        { email: this.email }, expect(error => {
        test.isFalse(error);
      }));
    },
    function (test, expect) {
      Meteor.call("getResetToken", expect((err, token) => {
        test.isFalse(err);
        test.isTrue(token);
        this.token = token;
      }));
    },
    // change password with bad old password. we stay logged in.
    function (test, expect) {
      Accounts.changePassword('wrong', 'doesntmatter', expect(error => {
        test.isTrue(error);
        test.equal(Meteor.user().username, this.username);
      }));
    },
    // change password with blank new password
    function (test, expect) {
      test.throws(
        () => Accounts.changePassword(this.password, ''),
        /Password may not be empty/
      );
    },
    // change password with good old password.
    function (test, expect) {
      Accounts.changePassword(this.password, this.password2,
                              loggedInAs(this.username, test, expect));
    },
    function (test, expect) {
      Meteor.call("getResetToken", expect((err, token) => {
        test.isFalse(err);
        test.isFalse(token);
      }));
    },
    logoutStep,
    // old password, failed login
    function (test, expect) {
      Meteor.loginWithPassword(this.email, this.password, expect(error => {
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
      this.email = `${Random.id()}-intercept@example.com`;
      this.password = 'password';
      this.password2 = 'password2';
      Accounts.createUser(
        { username: this.username, email: this.email, password: this.password },
        loggedInAs(this.username, test, expect)
      );
    },
    // Log in a second connection as this user.
    function (test, expect) {
      this.secondConn = DDP.connect(Meteor.absoluteUrl());
      this.secondConn.call('login',
                { user: { username: this.username }, password: hashPassword(this.password) },
                expect((err, result) => {
                  test.isFalse(err);
                  this.secondConn.setUserId(result.id);
                  test.isTrue(this.secondConn.userId());

                  this.secondConn.onReconnect = () =>
                    this.secondConn.apply(
                      'login',
                      [{ resume: result.token }],
                      { wait: true },
                      (err, result) =>
                        this.secondConn.setUserId(result && result.id || null)
                    );
                }));
    },
    function (test, expect) {
      Accounts.changePassword(
        this.password,
        this.password2,
        expect(err => test.isFalse(err))
      );
    },
    // Now that we've changed the password, wait until the second
    // connection gets logged out.
    function (test, expect) {
      pollUntil(
        expect,
        () => this.secondConn.userId() === null,
        10 * 1000,
        100
      );
    }
  ]);


  testAsyncMulti("passwords - forgotPassword client return error when empty email", [
    function (test, expect) {
      // setup
      this.email = '';
    },
    // forgotPassword called on client with blank email
    function (test, expect) {
      Accounts.forgotPassword(
        { email: this.email },
        expect(error => test.isTrue(error))
      );
    },
    // forgotPassword called on client with blank email and no callback.
    function (test, expect) {
      test.throws(
        () => Accounts.forgotPassword({ email: this.email }),
        /Must pass options\.email/
      );
    },
  ]);

  Tinytest.add(
    'passwords - forgotPassword only passes callback value to forgotPassword '
    + 'Method if callback is defined (to address issue #5676)',
    test => {
      let methodCallArgumentCount = 0;
      const originalMethodCall = Accounts.connection.call;
      const stubMethodCall = (...args) => {
        methodCallArgumentCount = args.length;
      }
      Accounts.connection.call = stubMethodCall;

      Accounts.forgotPassword({ email: 'test@meteor.com' });
      test.equal(
        methodCallArgumentCount,
        2,
        'Method call should have 2 arguments since no callback is passed in'
      );

      Accounts.forgotPassword({ email: 'test@meteor.com' }, () => {});
      test.equal(
        methodCallArgumentCount,
        3,
        'Method call should have 3 arguments since a callback is passed in'
      );

      Accounts.connection.call = originalMethodCall;
    }
  );

  testAsyncMulti("passwords - verifyEmail client return error when empty token", [
    function (test, expect) {
      // setup
      this.token = '';
    },
    // verifyEmail called on client with blank token
    function (test, expect) {
      Accounts.verifyEmail(
        this.token,
        expect(error => test.isTrue(error))
      );
    },
    // verifyEmail called on client with blank token and no callback.
    function (test, expect) {
      test.throws(
        () => Accounts.verifyEmail(this.token),
        /Need to pass token/
      );
    },
  ]);

  testAsyncMulti("passwords - resetPassword errors", [
    function (test, expect) {
      // setup
      this.token = '';
      this.newPassword = 'nonblankpassword';
    },
    // resetPassword called on client with blank token
    function (test, expect) {
      Accounts.resetPassword(
        this.token,
        this.newPassword,
        expect(error => test.isTrue(error))
      );
    },
    function (test, expect) {
      // setup
      this.token = 'nonblank-token';
      this.newPassword = '';
    },
    // resetPassword called on client with blank password
    function (test, expect) {
      Accounts.resetPassword(
        this.token,
        this.newPassword,
        expect(error => test.isTrue(error))
      );
    },
    // resetPassword called on client with blank password and no callback.
    function (test, expect) {
      test.throws(
        () => Accounts.resetPassword(this.token, this.newPassword),
        /Password may not be empty/
      );
    },
  ]);


  testAsyncMulti("passwords - new user hooks", [
    function (test, expect) {
      // setup
      this.username = Random.id();
      this.email = `${Random.id()}-intercept@example.com`;
      this.password = 'password';
    },
    // test Accounts.validateNewUser
    function(test, expect) {
      Accounts.createUser(
        {username: this.username, password: this.password,
         // should fail the new user validators
         profile: {invalid: true}},
        expect(error => {
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
        expect(error =>
          test.equal(
            error.reason,
            "An exception thrown within Accounts.validateNewUser"
          )
        )
      );
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
      const clientUser = Meteor.user();
      Accounts.connection.call('testMeteorUser', expect((err, result) => {
        test.equal(result._id, clientUser._id);
        test.equal(result.username, clientUser.username);
        test.equal(result.username, this.username);
        test.equal(result.profile.touchedByOnCreateUser, true);
        test.equal(err, undefined);
      }));
    },
    function(test, expect) {
      // Test that even with no published fields, we still have a document.
      Accounts.connection.call('clearUsernameAndProfile', expect(() => {
        test.isTrue(Meteor.userId());
        const user = Meteor.user();
        test.equal(user, {_id: Meteor.userId()});
      }));
    },
    logoutStep,
    function(test, expect) {
      const clientUser = Meteor.user();
      test.equal(clientUser, null);
      test.equal(Meteor.userId(), null);
      Accounts.connection.call('testMeteorUser', expect((err, result) => {
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
        expect(err => {
          test.isTrue(err);
          test.equal(err.error, 403);
          test.isFalse(Object.prototype.hasOwnProperty.call(Meteor.user(), 'disallowed'));
          test.isFalse(Object.prototype.hasOwnProperty.call(Meteor.user().profile, 'updated'));
        }));
    },
    function(test, expect) {
      // Can't update another user.
      Meteor.users.update(
        this.otherUserId, {$set: {'profile.updated': 42}},
        expect(err => {
          test.isTrue(err);
          test.equal(err.error, 403);
        }));
    },
    function(test, expect) {
      // Can't update using a non-ID selector. (This one is thrown client-side.)
      test.throws(() => Meteor.users.update(
        {username: this.username}, {$set: {'profile.updated': 42}}
      ));
      test.isFalse(Object.prototype.hasOwnProperty.call(Meteor.user().profile, 'updated'));
    },
    function(test, expect) {
      // Can update own profile using ID.
      Meteor.users.update(
        this.userId, {$set: {'profile.updated': 42}},
        expect(err => {
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
      const expectLoginError = expect(err => test.isTrue(err));
      Meteor.loginWithToken('invalid', expectLoginError);
    },

    function (test, expect) {
      // we can login with a valid token
      const expectLoginOK = expect(err => test.isFalse(err));
      Meteor.loginWithToken(Accounts._storedLoginToken(), expectLoginOK);
    },

    function (test, expect) {
      // test logging out invalidates our token
      const expectLoginError = expect(err => test.isTrue(err));
      const token = Accounts._storedLoginToken();
      test.isTrue(token);
      Meteor.logout(() => Meteor.loginWithToken(token, expectLoginError));
    },

    function (test, expect) {
      // Test that login tokens get expired. We should get logged out when a
      // token expires, and not be able to log in again with the same token.
      const expectNoError = expect(err => {
        test.isFalse(err);
      });

      Meteor.loginWithPassword(this.username, this.password, error => {
        this.token = Accounts._storedLoginToken();
        test.isTrue(this.token);
        expectNoError(error);
        Accounts.connection.call("expireTokens");
      });
    },
    waitForLoggedOutStep,
    function (test, expect) {
      const token = Accounts._storedLoginToken();
      test.isFalse(token);
    },
    function (test, expect) {
      // Test that once expireTokens is finished, we can't login again with our
      // previous token.
      Meteor.loginWithToken(this.token, expect((err, result) => {
        test.isTrue(err);
        test.equal(Meteor.userId(), null);
      }));
    },
    logoutStep,
    function (test, expect) {
      // Test that Meteor.logoutOtherClients logs out a second
      // authenticated connection while leaving Accounts.connection
      // logged in.
      const secondConn = DDP.connect(Meteor.absoluteUrl());
      let token;

      const expectSecondConnLoggedOut =
        expect((err, result) => test.isTrue(err));

      const expectAccountsConnLoggedIn =
        expect((err, result) => test.isFalse(err));

      const expectSecondConnLoggedIn = expect((err, result) => {
        test.equal(result.token, token);
        test.isFalse(err);
        Meteor.logoutOtherClients(err => {
          test.isFalse(err);
          secondConn.call('login', { resume: token },
                          expectSecondConnLoggedOut);
          Accounts.connection.call('login', {
            resume: Accounts._storedLoginToken()
          }, expectAccountsConnLoggedIn);
        });
      });

      Meteor.loginWithPassword(
        this.username,
        this.password,
        expect(err => {
          test.isFalse(err);
          token = Accounts._storedLoginToken();
          test.isTrue(token);
          secondConn.call('login', { resume: token },
                          expectSecondConnLoggedIn);
        })
      );
    },
    logoutStep,
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
        expect(error => {
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
        expect(error => {
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
        expect(error => {
          test.isTrue(error);
          test.equal(error.reason, 'hide actual error');
        })
      );
    },
    validateLoginsStep
  ]);

  testAsyncMulti("passwords - server onLogin hook", [
    function (test, expect) {
      Meteor.call("testCaptureLogins", expect(error => test.isFalse(error)));
    },
    function (test, expect) {
      this.username = Random.id();
      this.password = "password";

      Accounts.createUser(
        {username: this.username, password: this.password},
        loggedInAs(this.username, test, expect));
    },
    function (test, expect) {
      Meteor.call("testFetchCapturedLogins", expect((error, logins) => {
        test.isFalse(error);
        test.equal(logins.length, 1);
        const login = logins[0];
        test.isTrue(login.successful);
        const { attempt } = login;
        test.equal(attempt.type, "password");
        test.isTrue(attempt.allowed);
        test.equal(attempt.methodArguments[0].username, this.username);
      }));
    }
  ]);

  testAsyncMulti("passwords - client onLogin hook", [
    function (test, expect) {
      this.username = Random.id();
      this.password = "password";
      this.attempt = false;

      this.onLogin = Accounts.onLogin(attempt => {
        this.attempt = true;
      });

      Accounts.createUser(
        {username: this.username, password: this.password},
        loggedInAs(this.username, test, expect));
    },
    function (test, expect) {
      this.onLogin.stop();
      test.isTrue(this.attempt);
      expect(() => ({}))();
    }
  ]);

  testAsyncMulti("passwords - server onLogout hook", [
    function (test, expect) {
      Meteor.call("testCaptureLogouts", expect(error => test.isFalse(error)));
    },
    function (test, expect) {
      this.username = Random.id();
      this.password = "password";

      Accounts.createUser(
        {username: this.username, password: this.password},
        loggedInAs(this.username, test, expect));
    },
    logoutStep,
    function (test, expect) {
      Meteor.call("testFetchCapturedLogouts", expect((error, logouts) => {
        test.isFalse(error);
        test.equal(logouts.length, 1);
        const logout = logouts[0];
        test.isTrue(logout.successful);
      }));
    }
  ]);

  testAsyncMulti("passwords - client onLogout hook", [
    function (test, expect) {
      this.username = Random.id();
      this.password = "password";
      this.attempt = false;

      this.onLogout = Accounts.onLogout(() => this.logoutSuccess = true);

      Accounts.createUser(
        {username: this.username, password: this.password},
        loggedInAs(this.username, test, expect));
    },
    logoutStep,
    function (test, expect) {
      test.isTrue(this.logoutSuccess);
      expect(function() {})();
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
      Meteor.call("testCaptureLogins", expect(error => test.isFalse(error)));
    },
    function (test, expect) {
      Meteor.loginWithPassword(
        this.username,
        "incorrect",
        expect(error => test.isTrue(error))
      );
    },
    function (test, expect) {
      Meteor.call("testFetchCapturedLogins", expect((error, logins) => {
        test.isFalse(error);
        test.equal(logins.length, 1);
        const login = logins[0];
        test.isFalse(login.successful);
        const { attempt } = login;
        test.equal(attempt.type, "password");
        test.isFalse(attempt.allowed);
        test.equal(attempt.error.reason, "Incorrect password");
      }));
    },
    function (test, expect) {
      Meteor.call("testCaptureLogins", expect(error => test.isFalse(error)));
    },
    function (test, expect) {
      Meteor.loginWithPassword(
        "no such user",
        "incorrect",
        expect(error => test.isTrue(error))
      );
    },
    function (test, expect) {
      Meteor.call("testFetchCapturedLogins", expect((error, logins) => {
        test.isFalse(error);
        test.equal(logins.length, 1);
        const login = logins[0];
        test.isFalse(login.successful);
        const { attempt } = login;
        test.equal(attempt.type, "password");
        test.isFalse(attempt.allowed);
        test.equal(attempt.error.reason, "User not found");
      }));
    }
  ]);

  testAsyncMulti("passwords - client onLoginFailure hook", [
    function (test, expect) {
      this.username = Random.id();
      this.password = "password";
      this.attempt = false;

      this.onLoginFailure = Accounts.onLoginFailure(() => this.attempt = true);

      Accounts.createUser(
        {username: this.username, password: this.password},
        loggedInAs(this.username, test, expect));
    },
    logoutStep,
    function (test, expect) {
      Meteor.call("testCaptureLogins", expect(error => test.isFalse(error)));
    },
    function (test, expect) {
      Meteor.loginWithPassword(
        this.username,
        "incorrect",
        expect(error => test.isTrue(error))
      );
    },
    function (test, expect) {
      this.onLoginFailure.stop();
      test.isTrue(this.attempt);
      expect(() => ({}))();
    }
  ]);
}) ();


if (Meteor.isServer) (() => {

  Tinytest.add('passwords - setup more than one onCreateUserHook', test => {
      test.throws(() => Accounts.onCreateUser(() => ({})));
  });


  Tinytest.add('passwords - createUser hooks', test => {
      const username = Random.id();
      // should fail the new user validators
      test.throws(() => Accounts.createUser(
        {username: username, profile: {invalid: true}}
      ));

      const userId = Accounts.createUser({username: username,
                                        testOnCreateUserHook: true});

      test.isTrue(userId);
      const user = Meteor.users.findOne(userId);
      test.equal(user.profile.touchedByOnCreateUser, true);
    });


  Tinytest.add(
    'passwords - setPassword',
    test => {
      const username = Random.id();
      const email = `${username}-intercept@example.com`;

      const userId = Accounts.createUser({username: username, email: email});

      let user = Meteor.users.findOne(userId);
      // no services yet.
      test.equal(user.services.password, undefined);

      // set a new password.
      Accounts.setPassword(userId, 'new password');
      user = Meteor.users.findOne(userId);
      const oldSaltedHash = user.services.password.bcrypt;
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
      const newSaltedHash = user.services.password.bcrypt;
      test.isTrue(newSaltedHash);
      test.notEqual(oldSaltedHash, newSaltedHash);
      // No more reset token.
      test.isFalse(Meteor.users.findOne(userId).services.password.reset);
      // But loginTokens are still here since we did logout: false.
      test.isTrue(Meteor.users.findOne(userId).services.resume.loginTokens);

      // reset again, see that the login tokens are gone.
      Accounts.setPassword(userId, 'new password');
      user = Meteor.users.findOne(userId);
      const newerSaltedHash = user.services.password.bcrypt;
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
  Tinytest.add('accounts - user() out of context', test => {
    // basic server context, no method.
    test.throws(() => Meteor.user());
  });

  // XXX would be nice to test
  // Accounts.config({forbidClientAccountCreation: true})

  Tinytest.addAsync(
    'passwords - login token observes get cleaned up',
    (test, onComplete) => {
      const username = Random.id();
      Accounts.createUser({
        username: username,
        password: hashPassword('password')
      });

      makeTestConnection(
        test,
        (clientConn, serverConn) => {
          serverConn.onClose(() => {
            test.isFalse(Accounts._getUserObserve(serverConn.id));
            onComplete();
          });
          const result = clientConn.call('login', {
            user: {username: username},
            password: hashPassword('password')
          });
          test.isTrue(result);
          const token = Accounts._getAccountData(serverConn.id, 'loginToken');
          test.isTrue(token);

          // We poll here, instead of just checking `_getUserObserve`
          // once, because the login method defers the creation of the
          // observe, and setting up the observe yields, so we could end
          // up here before the observe has been set up.
          simplePoll(
            () => !! Accounts._getUserObserve(serverConn.id),
            () => {
              test.isTrue(Accounts._getUserObserve(serverConn.id));
              clientConn.disconnect();
            },
            () => {
              test.fail(
                `timed out waiting for user observe for connection ${serverConn.id}`
              );
              onComplete();
            }
          );
        },
        onComplete
      );
    }
  );

  Tinytest.add(
    "passwords - reset password doesn't work if email changed after email sent",
    test => {
      const username = Random.id();
      const email = `${username}-intercept@example.com`;

      const userId = Accounts.createUser({
        username: username,
        email: email,
        password: hashPassword("old-password")
      });

      const user = Meteor.users.findOne(userId);

      Accounts.sendResetPasswordEmail(userId, email);

      const resetPasswordEmailOptions =
        Meteor.call("getInterceptedEmails", email)[0];

      const re = new RegExp(`${Meteor.absoluteUrl()}#/reset-password/(\\S*)`);
      const match = resetPasswordEmailOptions.text.match(re);
      test.isTrue(match);
      const resetPasswordToken = match[1];

      const newEmail = `${Random.id()}-new@example.com`;
      Meteor.users.update(userId, {$set: {"emails.0.address": newEmail}});

      test.throws(
        () => Meteor.call("resetPassword", resetPasswordToken, hashPassword("new-password")),
        /Token has invalid email address/
      );
      test.throws(
        () => Meteor.call(
          "login",
          {user: {username: username},
          password: hashPassword("new-password")}
        ),
        /Incorrect password/);
    });

  Tinytest.addAsync(
    'passwords - reset password should work when token is not expired',
    (test, onComplete) => {
      const username = Random.id();
      const email = `${username}-intercept@example.com`;

      const userId = Accounts.createUser({
        username: username,
        email: email,
        password: hashPassword("old-password")
      });

      const user = Meteor.users.findOne(userId);

      Accounts.sendResetPasswordEmail(userId, email);

      const resetPasswordEmailOptions =
        Meteor.call("getInterceptedEmails", email)[0];

      const re = new RegExp(`${Meteor.absoluteUrl()}#/reset-password/(\\S*)`);
      const match = resetPasswordEmailOptions.text.match(re);
      test.isTrue(match);
      const resetPasswordToken = match[1];

      makeTestConnection(
        test,
        clientConn => {
          test.isTrue(clientConn.call(
            "resetPassword",
            resetPasswordToken,
            hashPassword("new-password")
          ));

          test.isTrue(clientConn.call("login", {
            user: { username },
            password: hashPassword("new-password")
          }));

          onComplete();
        }
      );
    });

  Tinytest.add(
    'passwords - reset password should not work when token is expired',
    test => {
      const username = Random.id();
      const email = `${username}-intercept@example.com`;

      const userId = Accounts.createUser({
        username: username,
        email: email,
        password: hashPassword("old-password")
      });

      const user = Meteor.users.findOne(userId);

      Accounts.sendResetPasswordEmail(userId, email);

      const resetPasswordEmailOptions =
        Meteor.call("getInterceptedEmails", email)[0];

      const re = new RegExp(`${Meteor.absoluteUrl()}#/reset-password/(\\S*)`);
      const match = resetPasswordEmailOptions.text.match(re);
      test.isTrue(match);
      const resetPasswordToken = match[1];

      Meteor.users.update(userId, {$set: {"services.password.reset.when":  new Date(Date.now() + -5 * 24 * 3600 * 1000) }});

      test.throws(
        () => Meteor.call("resetPassword", resetPasswordToken, hashPassword("new-password")),
        /Token expired/
      );
      test.throws(
        () => Meteor.call(
          "login",
          {user: {username: username},
          password: hashPassword("new-password")}
        ),
        /Incorrect password/);
    });

  Tinytest.add('forgotPassword - different error messages returned depending' +
  ' on whether ambiguousErrorMessages flag is passed in Account.config',
    test =>{
        const username = Random.id();
        const email = `${Random.id()}-intercept@example.com`;
        const randomEmail = `${Random.id()}-Ada_intercept@some.com`;
        const wrongOptions = {email: randomEmail}
        const password = 'password';
        const options = Accounts._options

        Accounts.createUser(
          { username: username, email: email, password: hashPassword(password) },
          );

        Accounts._options.ambiguousErrorMessages = true
        test.throws(
          ()=> Meteor.call('forgotPassword', wrongOptions),
          'Something went wrong. Please check your credentials'
        )

        Accounts._options.ambiguousErrorMessages = false
        test.throws(
          ()=> Meteor.call('forgotPassword', wrongOptions),
          'User not found'
        )
        // return accounts as it were
        Accounts._options = options
    });

  Tinytest.add(
    'passwords - reset tokens with reasons get cleaned up',
    test => {
      const email = `${test.id}-intercept@example.com`;
      const userId = Accounts.createUser({email: email, password: hashPassword('password')});
      Accounts.sendResetPasswordEmail(userId, email);
      test.isTrue(!!Meteor.users.findOne(userId).services.password.reset);

      Accounts._expirePasswordResetTokens(new Date(), userId);

      test.isUndefined(Meteor.users.findOne(userId).services.password.reset);
    });

  Tinytest.add(
    'passwords - reset tokens without reasons get cleaned up',
    test => {
      const email = `${test.id}-intercept@example.com`;
      const userId = Accounts.createUser({email: email, password: hashPassword('password')});
      Accounts.sendResetPasswordEmail(userId, email);
      Meteor.users.update({_id: userId}, {$unset: {"services.password.reset.reason": 1}});
      test.isTrue(!!Meteor.users.findOne(userId).services.password.reset);
      test.isUndefined(Meteor.users.findOne(userId).services.password.reset.reason);

      Accounts._expirePasswordResetTokens(new Date(), userId);

      test.isUndefined(Meteor.users.findOne(userId).services.password.reset);
    });

  Tinytest.addAsync(
    'passwords - enroll password should work when token is not expired',
    (test, onComplete) => {
      const username = Random.id();
      const email = `${username}-intercept@example.com`;

      const userId = Accounts.createUser({
        username: username,
        email: email
      });

      const user = Meteor.users.findOne(userId);

      Accounts.sendEnrollmentEmail(userId, email);

      const enrollPasswordEmailOptions =
        Meteor.call("getInterceptedEmails", email)[0];

      const re = new RegExp(`${Meteor.absoluteUrl()}#/enroll-account/(\\S*)`);
      const match = enrollPasswordEmailOptions.text.match(re);
      test.isTrue(match);
      const enrollPasswordToken = match[1];

      makeTestConnection(
        test,
        clientConn => {
          test.isTrue(clientConn.call(
            "resetPassword",
            enrollPasswordToken,
            hashPassword("new-password")
          ));

          test.isTrue(clientConn.call("login", {
            user: { username },
            password: hashPassword("new-password")
          }));

          onComplete();
        });
    });

  Tinytest.add(
    'passwords - enroll password should not work when token is expired',
    test => {
      const username = Random.id();
      const email = `${username}-intercept@example.com`;

      const userId = Accounts.createUser({
        username: username,
        email: email
      });

      const user = Meteor.users.findOne(userId);

      Accounts.sendEnrollmentEmail(userId, email);

      const enrollPasswordEmailOptions =
        Meteor.call("getInterceptedEmails", email)[0];

      const re = new RegExp(`${Meteor.absoluteUrl()}#/enroll-account/(\\S*)`);
      const match = enrollPasswordEmailOptions.text.match(re);
      test.isTrue(match);
      const enrollPasswordToken = match[1];

      Meteor.users.update(userId, {$set: {"services.password.enroll.when": new Date(Date.now() + -35 * 24 * 3600 * 1000) }});

      test.throws(
        () => Meteor.call("resetPassword", enrollPasswordToken, hashPassword("new-password")),
        /Token expired/
      );
    });

  Tinytest.add('passwords - enroll tokens get cleaned up', test => {
    const email = `${test.id}-intercept@example.com`;
    const userId = Accounts.createUser({email: email, password: hashPassword('password')});

    Accounts.sendEnrollmentEmail(userId, email);
    test.isTrue(!!Meteor.users.findOne(userId).services.password.enroll);
    Accounts._expirePasswordEnrollTokens(new Date(), userId);
    test.isUndefined(Meteor.users.findOne(userId).services.password.enroll);
  });

  Tinytest.add(
    "passwords - enroll tokens don't get cleaned up when reset tokens are cleaned up",
    test => {
      const email = `${test.id}-intercept@example.com`;
      const userId = Accounts.createUser({email: email, password: hashPassword('password')});

      Accounts.sendEnrollmentEmail(userId, email);
      const enrollToken = Meteor.users.findOne(userId).services.password.enroll;
      test.isTrue(enrollToken);

      Accounts._expirePasswordResetTokens(new Date(), userId);
      test.equal(enrollToken, Meteor.users.findOne(userId).services.password.enroll);
    }
  )

  Tinytest.add(
    "passwords - reset tokens don't get cleaned up when enroll tokens are cleaned up",
    test => {
      const email = `${test.id}-intercept@example.com`;
      const userId = Accounts.createUser({email: email, password: hashPassword('password')});

      Accounts.sendResetPasswordEmail(userId, email);
      const resetToken = Meteor.users.findOne(userId).services.password.reset;
      test.isTrue(resetToken);

      Accounts._expirePasswordEnrollTokens(new Date(), userId);
      test.equal(resetToken,Meteor.users.findOne(userId).services.password.reset);
    }
  )

  // We should be able to change the username
  Tinytest.add("passwords - change username & findUserByUsername", test => {
    const username = Random.id();
    const ignoreFieldName = "profile";
    const userId = Accounts.createUser({
      username,
      [ignoreFieldName]: {name: 'foo'},
    });

    test.isTrue(userId);

    const newUsername = Random.id();
    Accounts.setUsername(userId, newUsername);

    test.equal(Accounts._findUserByQuery({id: userId}).username, newUsername);

    // Test findUserByUsername as well while we're here
    let user = Accounts.findUserByUsername(newUsername);
    test.equal(user._id, userId, 'userId - ignore');
    test.isNotUndefined(user[ignoreFieldName], 'field - no ignore');

    // Test default field selector
    const options = Accounts._options;
    Accounts._options = {defaultFieldSelector: {[ignoreFieldName]: 0}};
    user = Accounts.findUserByUsername(newUsername);
    test.equal(user.username, newUsername, 'username - default ignore');
    test.isUndefined(user[ignoreFieldName], 'field - default ignore');

    // Test default field selector over-ride
    user = Accounts.findUserByUsername(newUsername, {
      fields: {
        [ignoreFieldName]: 1
      }
    });
    test.isUndefined(user.username, 'username - override');
    test.isNotUndefined(user[ignoreFieldName], 'field - override');

    Accounts._options = options;
  });

  Tinytest.add("passwords - change username to a new one only differing " +
      "in case", test => {
    const username = `${Random.id()}user`;
    const userId = Accounts.createUser({
      username: username.toUpperCase()
    });

    test.isTrue(userId);

    const newUsername = username.toLowerCase();
    Accounts.setUsername(userId, newUsername);

    test.equal(Accounts._findUserByQuery({id: userId}).username, newUsername);
  });

  // We should not be able to change the username to one that only
  // differs in case from an existing one
  Tinytest.add("passwords - change username should fail when there are " +
      "existing users with a username only differing in case", test => {
    const username = `${Random.id()}user`;
    const usernameUpper = username.toUpperCase();

    const userId1 = Accounts.createUser({
      username: username
    });

    const user2OriginalUsername = Random.id();
    const userId2 = Accounts.createUser({
      username: user2OriginalUsername
    });

    test.isTrue(userId1);
    test.isTrue(userId2);

    test.throws(
      () => Accounts.setUsername(userId2, usernameUpper),
      /Username already exists/
    );

    test.equal(Accounts._findUserByQuery({id: userId2}).username,
      user2OriginalUsername);
  });

  Tinytest.add("passwords - add email & findUserByEmail", test => {
    const origEmail = `${Random.id()}@turing.com`;
    const username = Random.id();
    const ignoreFieldName = "profile";
    const userId = Accounts.createUser({
      email: origEmail,
      username,
      [ignoreFieldName]: {name: 'foo'},
    });

    const newEmail = `${Random.id()}@turing.com`;
    Accounts.addEmail(userId, newEmail);

    const thirdEmail = `${Random.id()}@turing.com`;
    Accounts.addEmail(userId, thirdEmail, true);

    test.equal(Accounts._findUserByQuery({id: userId}).emails, [
      { address: origEmail, verified: false },
      { address: newEmail, verified: false },
      { address: thirdEmail, verified: true }
    ]);

    // Test findUserByEmail as well while we're here
    let user = Accounts.findUserByEmail(origEmail);
    test.equal(user._id, userId);
    test.isNotUndefined(user[ignoreFieldName], 'field - no ignore');

    // Test default field selector
    const options = Accounts._options;
    Accounts._options = {defaultFieldSelector: {[ignoreFieldName]: 0}};
    user = Accounts.findUserByEmail(origEmail);
    test.equal(user.username, username, 'username - default ignore');
    test.isUndefined(user[ignoreFieldName], 'field - default ignore');

    // Test default field selector over-ride
    user = Accounts.findUserByEmail(origEmail, {
      fields: {
        [ignoreFieldName]: 1
      }
    });
    test.equal(user._id, userId, 'userId - override');
    test.isUndefined(user.username, 'username - override');
    test.isNotUndefined(user[ignoreFieldName], 'field - override');

    Accounts._options = options;
  });

  Tinytest.add("passwords - add email when user has not an existing email", test => {
    const userId = Accounts.createUser({
      username: `user${Random.id()}`
    });

    const newEmail = `${Random.id()}@turing.com`;
    Accounts.addEmail(userId, newEmail);

    test.equal(Accounts._findUserByQuery({id: userId}).emails, [
      { address: newEmail, verified: false },
    ]);
  });

  Tinytest.add("passwords - add email when the user has an existing email " +
      "only differing in case", test => {
    const origEmail = `${Random.id()}@turing.com`;
    const userId = Accounts.createUser({
      email: origEmail
    });

    const newEmail = `${Random.id()}@turing.com`;
    Accounts.addEmail(userId, newEmail);

    const thirdEmail = origEmail.toUpperCase();
    Accounts.addEmail(userId, thirdEmail, true);

    test.equal(Accounts._findUserByQuery({id: userId}).emails, [
      { address: thirdEmail, verified: true },
      { address: newEmail, verified: false }
    ]);
  });

  Tinytest.add("passwords - add email should fail when there is an existing " +
      "user with an email only differing in case", test => {
    const user1Email = `${Random.id()}@turing.com`;
    const userId1 = Accounts.createUser({
      email: user1Email
    });

    const user2Email = `${Random.id()}@turing.com`;
    const userId2 = Accounts.createUser({
      email: user2Email
    });

    const dupEmail = user1Email.toUpperCase();
    test.throws(
      () => Accounts.addEmail(userId2, dupEmail),
      /Email already exists/
    );

    test.equal(Accounts._findUserByQuery({id: userId1}).emails, [
      { address: user1Email, verified: false }
    ]);

    test.equal(Accounts._findUserByQuery({id: userId2}).emails, [
      { address: user2Email, verified: false }
    ]);
  });

  Tinytest.add("passwords - remove email", test => {
    const origEmail = `${Random.id()}@turing.com`;
    const userId = Accounts.createUser({
      email: origEmail
    });

    const newEmail = `${Random.id()}@turing.com`;
    Accounts.addEmail(userId, newEmail);

    const thirdEmail = `${Random.id()}@turing.com`;
    Accounts.addEmail(userId, thirdEmail, true);

    test.equal(Accounts._findUserByQuery({id: userId}).emails, [
      { address: origEmail, verified: false },
      { address: newEmail, verified: false },
      { address: thirdEmail, verified: true }
    ]);

    Accounts.removeEmail(userId, newEmail);

    test.equal(Accounts._findUserByQuery({id: userId}).emails, [
      { address: origEmail, verified: false },
      { address: thirdEmail, verified: true }
    ]);

    Accounts.removeEmail(userId, origEmail);

    test.equal(Accounts._findUserByQuery({id: userId}).emails, [
      { address: thirdEmail, verified: true }
    ]);
  });

  Tinytest.addAsync(
    'passwords - allow custom bcrypt rounds',
    async (test, done) => {
      const getUserHashRounds = user =>
        Number(user.services.password.bcrypt.substring(4, 6));


      // Verify that a bcrypt hash generated for a new account uses the
      // default number of rounds.
      let username = Random.id();
      const password = hashPassword('abc123');
      const userId1 = Accounts.createUser({ username, password });
      let user1 = Meteor.users.findOne(userId1);
      let rounds = getUserHashRounds(user1);
      test.equal(rounds, Accounts._bcryptRounds());

      // When a custom number of bcrypt rounds is set via Accounts.config,
      // and an account was already created using the default number of rounds,
      // make sure that a new hash is created (and stored) using the new number
      // of rounds, the next time the password is checked.
      const defaultRounds = Accounts._bcryptRounds();
      const customRounds = 11;
      Accounts._options.bcryptRounds = customRounds;
      await Accounts._checkPasswordAsync(user1, password);
      Meteor.setTimeout(() => {
        user1 = Meteor.users.findOne(userId1);
        rounds = getUserHashRounds(user1);
        test.equal(rounds, customRounds);

        // When a custom number of bcrypt rounds is set, make sure it's
        // used for new bcrypt password hashes.
        username = Random.id();
        const userId2 = Accounts.createUser({ username, password });
        const user2 = Meteor.users.findOne(userId2);
        rounds = getUserHashRounds(user2);
        test.equal(rounds, customRounds);

        // Cleanup
        Accounts._options.bcryptRounds = defaultRounds;
        Meteor.users.remove(userId1);
        Meteor.users.remove(userId2);
        done();
      }, 5000);
    }
  );

  Tinytest.add('passwords - extra params in email urls', (test) => {
    const username = Random.id();
    const email = `${username}-intercept@example.com`;

    const userId = Accounts.createUser({
      username: username,
      email: email
    });

    const extraParams = { test: 'success' };
    Accounts.sendEnrollmentEmail(userId, email, null, extraParams);

    const enrollPasswordEmailOptions =
      Meteor.call("getInterceptedEmails", email)[0];

    const re = new RegExp(`${Meteor.absoluteUrl()}(\\S*)`);
    const match = enrollPasswordEmailOptions.text.match(re);
    const url = new URL(match)
    test.equal(url.searchParams.get('test'), extraParams.test);
  });

}) ();
