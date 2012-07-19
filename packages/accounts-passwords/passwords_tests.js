(function () {

  // XXX note, only one test can do login/logout things at once! for
  // now, that is this test.

  var username = Meteor.uuid();
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
      Meteor.loginNewUser(username, email, password, expect(function (error) {
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
    // change w/ no old password.
    function (test, expect) {
      Meteor.changePassword(null, password3, expect(function (error) {
        test.isTrue(error);
      }));
    },
    // XXX test Meteor.accounts.config(unsafePasswordChanges)
    //
    // XXX test raw (non-srp) password setting. Need to send a method
    // directly, there is no API for this. Test this once we have
    // unsafePasswordChanges. Duplicating the password exchange code is
    // gross.

    logoutStep
  ]);

}) ();
