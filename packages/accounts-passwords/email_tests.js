(function () {
  var email = Meteor.uuid() + "-intercept@example.com";
  var resetPasswordToken;

  testAsyncMulti("accounts emails - reset password flow", [
    function (test, expect) {
      Meteor.createUser({email: email, password: 'foobar'},
                        expect(function (error) {
                          test.equal(error, undefined);
                        }));
    },
    function (test, expect) {
      Meteor.forgotPassword({email: email}, expect(function (error) {
        test.equal(error, undefined);
      }));
    },
    function (test, expect) {
      Meteor.call("getInterceptedEmails", email, expect(function (error, result) {
        test.notEqual(result, undefined);
        test.equal(result.length, 1);
        var content = result[0];

        var match = content.match(
          new RegExp(window.location.protocol + "//" +
                     window.location.host + "/#\\?reset-password/(\\S*)"));
        test.isTrue(match);
        resetPasswordToken = match[1];
        console.log(resetPasswordToken);
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
        {email: email}, "newPassword",
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
}) ();