(function () {
  // intentionally initialize later so that we can debug tests after
  // they fail without trying to recreate a user with the same email
  // address
  var email1;
  var email2;

  var resetPasswordToken;
  var validateEmailToken;

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
        test.equal(result.length, 1);
        var content = result[0];

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

  testAsyncMulti("accounts emails - validate email flow", [
    function (test, expect) {
      email2 = Meteor.uuid() + "-intercept@example.com";
      Meteor.createUser(
        {email: email2, password: 'foobar', validation: true},
        expect(function (error) {
          test.equal(error, undefined);
          test.equal(Meteor.user().emails.length, 1);
          test.equal(Meteor.user().emails[0], email2);
          test.isFalse(Meteor.user().validatedEmails);
        }));
    },
    function (test, expect) {
      Meteor.call("getInterceptedEmails", email2, expect(function (error, result) {
        test.notEqual(result, undefined);
        test.equal(result.length, 1);
        var content = result[0];

        var match = content.match(
          new RegExp(window.location.protocol + "//" +
                     window.location.host + "/#\\?validate-email/(\\S*)"));
        test.isTrue(match);
        validateEmailToken = match[1];
      }));
    },
    function (test, expect) {
      Meteor.validateEmail(validateEmailToken, expect(function(error) {
        test.isFalse(error);
      }));
      // ARGH! ON QUIESCE!!
      Meteor.default_connection.onQuiesce(expect(function () {
        test.equal(Meteor.user().emails.length, 1);
        test.equal(Meteor.user().emails[0], email2);
        test.equal(Meteor.user().validatedEmails.length, 1);
        test.equal(Meteor.user().validatedEmails[0], email2);
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