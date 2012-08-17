(function () {
  // intentionally initialize later so that we can debug tests after
  // they fail without trying to recreate a user with the same email
  // address
  var email1;
  var email2;
  var email3;
  var email4;

  var resetPasswordToken;
  var validateEmailToken;
  var enrollAccountToken;

  testAsyncMulti("accounts emails - reset password flow", [
    function (test, expect) {
      email1 = Meteor.uuid() + "-intercept@example.com";
      Meteor.createUser({email: email1, password: 'foobar'},
                        expect(function (error) {
                          test.equal(error, undefined);
                        }));
    },
    function (test, expect) {
      Meteor.forgotPassword({email: email1}, expect(function (error) {
        test.equal(error, undefined);
      }));
    },
    function (test, expect) {
      Meteor.call("getInterceptedEmails", email1, expect(function (error, result) {
        test.notEqual(result, undefined);
        test.equal(result.length, 2); // the first is the email validation
        var content = result[1];

        var match = content.match(
          new RegExp(window.location.protocol + "//" +
                     window.location.host + "/#\\?reset-password/(\\S*)"));
        test.isTrue(match);
        resetPasswordToken = match[1];
      }));
    },
    function (test, expect) {
      Meteor.resetPassword(resetPasswordToken, "newPassword", expect(function(error) {
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

  var getValidateEmailToken = function (email, test, expect) {
    Meteor.call("getInterceptedEmails", email, expect(function (error, result) {
      test.notEqual(result, undefined);
      test.equal(result.length, 1);
      var content = result[0];

      var match = content.match(
        new RegExp(window.location.protocol + "//" +
                   window.location.host + "/#\\?validate-email/(\\S*)"));
      test.isTrue(match);
      validateEmailToken = match[1];
    }));
  };

  testAsyncMulti("accounts emails - validate email flow", [
    function (test, expect) {
      email2 = Meteor.uuid() + "-intercept@example.com";
      email3 = Meteor.uuid() + "-intercept@example.com";
      Meteor.createUser(
        {email: email2, password: 'foobar'},
        expect(function (error) {
          test.equal(error, undefined);
        }));
    },
    function (test, expect) {
      test.equal(Meteor.user().emails.length, 1);
      test.equal(Meteor.user().emails[0].email, email2);
      test.isFalse(Meteor.user().emails[0].validated);
    },
    function (test, expect) {
      getValidateEmailToken(email2, test, expect);
    },
    function (test, expect) {
      Meteor.validateEmail(validateEmailToken, expect(function(error) {
        test.isFalse(error);
      }));
      // ARGH! ON QUIESCE!!
      Meteor.default_connection.onQuiesce(expect(function () {
        test.equal(Meteor.user().emails.length, 1);
        test.equal(Meteor.user().emails[0].email, email2);
        test.isTrue(Meteor.user().emails[0].validated);
      }));
    },
    function (test, expect) {
      Meteor.call(
        "addEmailForTestAndValidate", email3,
        expect(function (error, result) {
          test.isFalse(error);
        }));
    },
    function (test, expect) {
      Meteor.default_connection.onQuiesce(expect(function () {
        test.equal(Meteor.user().emails.length, 2);
        test.equal(Meteor.user().emails[1].email, email3);
        test.isFalse(Meteor.user().emails[1].validated);
      }));
    },
    function (test, expect) {
      getValidateEmailToken(email3, test, expect);
    },
    function (test, expect) {
      Meteor.validateEmail(validateEmailToken, expect(function(error) {
        test.isFalse(error);
      }));
    },
    function (test, expect) {
      Meteor.default_connection.onQuiesce(expect(function () {
        test.equal(Meteor.user().emails[1].email, email3);
        test.isTrue(Meteor.user().emails[1].validated);
      }));
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
                   window.location.host + "/#\\?enroll-account/(\\S*)"));
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
          test.equal(user.emails[0].email, email4);
          test.isFalse(user.emails[0].validated);
        }));
    },
    function (test, expect) {
      getEnrollAccountToken(email4, test, expect);
    },
    function (test, expect) {
      Meteor.enrollAccount(enrollAccountToken, 'password', expect(function(error) {
        test.isFalse(error);
      }));
    },
    function (test, expect) {
      Meteor.default_connection.onQuiesce(expect(function () {
        test.equal(Meteor.user().emails.length, 1);
        test.equal(Meteor.user().emails[0].email, email4);
        test.isTrue(Meteor.user().emails[0].validated);
      }));
    },
    function (test, expect) {
      Meteor.logout(expect(function (error) {
        test.equal(error, undefined);
        test.equal(Meteor.user(), null);
      }));
    },
    function (test, expect) {
      Meteor.loginWithPassword({email: email4}, 'password', expect(function(error) {
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
}) ();
