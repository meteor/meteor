// intentionally initialize later so that we can debug tests after
// they fail without trying to recreate a user with the same email
// address
var email1;
var email2;
var email3;
var email4;

var resetPasswordToken;
var verifyEmailToken;
var enrollAccountToken;

Accounts._isolateLoginTokenForTest();

testAsyncMulti("accounts emails - reset password flow", [
  function (test, expect) {
    email1 = Random.id() + "-intercept@example.com";
    Accounts.createUser({email: email1, password: 'foobar'},
                        expect(function (error) {
                          test.equal(error, undefined);
                        }));
  },
  function (test, expect) {
    Accounts.forgotPassword({email: email1}, expect(function (error) {
      test.equal(error, undefined);
    }));
  },
  function (test, expect) {
    Accounts.connection.call(
      "getInterceptedEmails", email1, expect(function (error, result) {
        test.equal(error, undefined);
        test.notEqual(result, undefined);
        test.equal(result.length, 2); // the first is the email verification
        var options = result[1];

        var re = new RegExp(Meteor.absoluteUrl() + "#/reset-password/(\\S*)")
        var match = options.text.match(re);
        test.isTrue(match);
        resetPasswordToken = match[1];
        test.isTrue(options.html.match(re));
      }));
  },
  function (test, expect) {
    Accounts.resetPassword(resetPasswordToken, "newPassword", expect(function(error) {
      test.isFalse(error);
    }));
  },
  function (test, expect) {
    Meteor.logout(expect(function (error) {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  },
  function (test, expect) {
    Meteor.loginWithPassword(
      {email: email1}, "newPassword",
      expect(function (error) {
        test.isFalse(error);
      }));
  },
  function (test, expect) {
    Meteor.logout(expect(function (error) {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  }
]);

var getVerifyEmailToken = function (email, test, expect) {
  Accounts.connection.call(
    "getInterceptedEmails", email, expect(function (error, result) {
      test.equal(error, undefined);
      test.notEqual(result, undefined);
      test.equal(result.length, 1);
      var options = result[0];

      var re = new RegExp(Meteor.absoluteUrl() + "#/verify-email/(\\S*)");
      var match = options.text.match(re);
      test.isTrue(match);
      verifyEmailToken = match[1];
      test.isTrue(options.html.match(re));
    }));
};

var loggedIn = function (test, expect) {
  return expect(function (error) {
    test.equal(error, undefined);
    test.isTrue(Meteor.user());
  });
};

testAsyncMulti("accounts emails - verify email flow", [
  function (test, expect) {
    email2 = Random.id() + "-intercept@example.com";
    email3 = Random.id() + "-intercept@example.com";
    Accounts.createUser(
      {email: email2, password: 'foobar'},
      loggedIn(test, expect));
  },
  function (test, expect) {
    test.equal(Meteor.user().emails.length, 1);
    test.equal(Meteor.user().emails[0].address, email2);
    test.isFalse(Meteor.user().emails[0].verified);
    // We should NOT be publishing things like verification tokens!
    test.isFalse(_.has(Meteor.user(), 'services'));
  },
  function (test, expect) {
    getVerifyEmailToken(email2, test, expect);
  },
  function (test, expect) {
    // Log out, to test that verifyEmail logs us back in.
    Meteor.logout(expect(function (error) {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  },
  function (test, expect) {
    Accounts.verifyEmail(verifyEmailToken,
                         loggedIn(test, expect));
  },
  function (test, expect) {
    test.equal(Meteor.user().emails.length, 1);
    test.equal(Meteor.user().emails[0].address, email2);
    test.isTrue(Meteor.user().emails[0].verified);
  },
  function (test, expect) {
    Accounts.connection.call(
      "addEmailForTestAndVerify", email3,
      expect(function (error, result) {
        test.isFalse(error);
        test.equal(Meteor.user().emails.length, 2);
        test.equal(Meteor.user().emails[1].address, email3);
        test.isFalse(Meteor.user().emails[1].verified);
      }));
  },
  function (test, expect) {
    getVerifyEmailToken(email3, test, expect);
  },
  function (test, expect) {
    // Log out, to test that verifyEmail logs us back in. (And if we don't
    // do that, waitUntilLoggedIn won't be able to prevent race conditions.)
    Meteor.logout(expect(function (error) {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  },
  function (test, expect) {
    Accounts.verifyEmail(verifyEmailToken,
                         loggedIn(test, expect));
  },
  function (test, expect) {
    test.equal(Meteor.user().emails[1].address, email3);
    test.isTrue(Meteor.user().emails[1].verified);
  },
  function (test, expect) {
    Meteor.logout(expect(function (error) {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  }
]);

var getEnrollAccountToken = function (email, test, expect) {
  Accounts.connection.call(
    "getInterceptedEmails", email, expect(function (error, result) {
      test.equal(error, undefined);
      test.notEqual(result, undefined);
      test.equal(result.length, 1);
      var options = result[0];

      var re = new RegExp(Meteor.absoluteUrl() + "#/enroll-account/(\\S*)")
      var match = options.text.match(re);
      test.isTrue(match);
      enrollAccountToken = match[1];
      test.isTrue(options.html.match(re));
    }));
};

testAsyncMulti("accounts emails - enroll account flow", [
  function (test, expect) {
    email4 = Random.id() + "-intercept@example.com";
    Accounts.connection.call("createUserOnServer", email4,
      expect(function (error, result) {
        test.isFalse(error);
        var user = result;
        test.equal(user.emails.length, 1);
        test.equal(user.emails[0].address, email4);
        test.isFalse(user.emails[0].verified);
      }));
  },
  function (test, expect) {
    getEnrollAccountToken(email4, test, expect);
  },
  function (test, expect) {
    Accounts.resetPassword(enrollAccountToken, 'password',
                           loggedIn(test, expect));
  },
  function (test, expect) {
    test.equal(Meteor.user().emails.length, 1);
    test.equal(Meteor.user().emails[0].address, email4);
    test.isTrue(Meteor.user().emails[0].verified);
  },
  function (test, expect) {
    Meteor.logout(expect(function (error) {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  },
  function (test, expect) {
    Meteor.loginWithPassword({email: email4}, 'password',
                             loggedIn(test ,expect));
  },
  function (test, expect) {
    test.equal(Meteor.user().emails.length, 1);
    test.equal(Meteor.user().emails[0].address, email4);
    test.isTrue(Meteor.user().emails[0].verified);
  },
  function (test, expect) {
    Meteor.logout(expect(function (error) {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  }
]);
