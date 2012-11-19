(function () {
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
      email1 = Meteor.uuid() + "-intercept@example.com";
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
      Meteor.call("getInterceptedEmails", email1, expect(function (error, result) {
        test.notEqual(result, undefined);
        test.equal(result.length, 2); // the first is the email verification
        var content = result[1];

        var match = content.match(
          new RegExp(window.location.protocol + "//" +
                     window.location.host + "/#\\/reset-password/(\\S*)"));
        test.isTrue(match);
        resetPasswordToken = match[1];
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
    Meteor.call("getInterceptedEmails", email, expect(function (error, result) {
      test.isFalse(error);
      test.notEqual(result, undefined);
      test.equal(result.length, 1);
      var content = result[0];

      var match = content.match(
        new RegExp(window.location.protocol + "//" +
                   window.location.host + "/#\\/verify-email/(\\S*)"));
      test.isTrue(match);
      verifyEmailToken = match[1];
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
      email2 = Meteor.uuid() + "-intercept@example.com";
      email3 = Meteor.uuid() + "-intercept@example.com";
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
      Meteor.call(
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
    Meteor.call("getInterceptedEmails", email, expect(function (error, result) {
      test.notEqual(result, undefined);
      test.equal(result.length, 1);
      var content = result[0];

      var match = content.match(
        new RegExp(window.location.protocol + "//" +
                   window.location.host + "/#\\/enroll-account/(\\S*)"));
      test.isTrue(match);
      enrollAccountToken = match[1];
    }));
  };

  testAsyncMulti("accounts emails - enroll account flow", [
    function (test, expect) {
      email4 = Meteor.uuid() + "-intercept@example.com";
      Meteor.call("createUserOnServer", email4,
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
}) ();
