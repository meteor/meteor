var resetPasswordToken;
var verifyEmailToken;
var enrollAccountToken;

Accounts._isolateLoginTokenForTest();

if (Meteor.isServer) {
  Accounts.removeDefaultRateLimit();
}

testAsyncMulti("accounts emails - reset password flow", [
  function (test, expect) {
    this.randomSuffix = Random.id();
    this.email = "Ada-intercept@example.com" + this.randomSuffix;
    // Create the user with another email and add the tested for email later,
    // so we can test whether forgotPassword respects the passed in email
    Accounts.createUser({email: "another@example.com" + this.randomSuffix, password: 'foobar'},
      expect((error) => {
        test.equal(error, undefined);
        Meteor.call("addEmailForTestAndVerify", this.email);
      }));
  },
  function (test, expect) {
    Accounts.forgotPassword({email: this.email}, expect((error) => {
      test.equal(error, undefined);
    }));
  },
  function (test, expect) {
    Accounts.connection.call(
      "getInterceptedEmails", this.email, expect((error, result) => {
        test.equal(error, undefined);
        test.notEqual(result, undefined);
        test.equal(result.length, 2); // the first is the email verification
        var options = result[1];

        var re = new RegExp(Meteor.absoluteUrl() + "#/reset-password/(\\S*)");
        var match = options.text.match(re);
        test.isTrue(match);
        resetPasswordToken = match[1];
        test.isTrue(options.html.match(re));

        test.equal(options.from, 'test@meteor.com');
        test.equal(options.headers['My-Custom-Header'], 'Cool');
      }));
  },
  function (test, expect) {
    Accounts.resetPassword(resetPasswordToken, "newPassword", expect((error) => {
      test.isFalse(error);
    }));
  },
  function (test, expect) {
    Meteor.logout(expect((error) => {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  },
  function (test, expect) {
    Meteor.loginWithPassword(
      {email: this.email}, "newPassword",
      expect((error) => {
        test.isFalse(error);
      }));
  },
  function (test, expect) {
    Meteor.logout(expect((error) => {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  }
]);

testAsyncMulti(`accounts emails - \
reset password flow with case insensitive email`, [
  function (test, expect) {
    this.randomSuffix = Random.id();
    this.email = "Ada-intercept@example.com" + this.randomSuffix;
    // Create the user with another email and add the tested for email later,
    // so we can test whether forgotPassword respects the passed in email
    Accounts.createUser({email: "another@example.com" + this.randomSuffix, password: 'foobar'},
      expect((error) => {
        test.equal(error, undefined);
        Meteor.call("addEmailForTestAndVerify", this.email);
      }));
  },
  function (test, expect) {
    Accounts.forgotPassword({email: "ada-intercept@example.com" + this.randomSuffix}, expect((error) => {
      test.equal(error, undefined);
    }));
  },
  function (test, expect) {
    Accounts.connection.call(
      "getInterceptedEmails", this.email, expect((error, result) => {
        test.equal(error, undefined);
        test.notEqual(result, undefined);
        test.equal(result.length, 2); // the first is the email verification
        var options = result[1];

        var re = new RegExp(Meteor.absoluteUrl() + "#/reset-password/(\\S*)");
        var match = options.text.match(re);
        test.isTrue(match);
        resetPasswordToken = match[1];
        test.isTrue(options.html.match(re));

        test.equal(options.from, 'test@meteor.com');
        test.equal(options.headers['My-Custom-Header'], 'Cool');
      }));
  },
  function (test, expect) {
    Accounts.resetPassword(resetPasswordToken, "newPassword", expect((error) => {
      test.isFalse(error);
    }));
  },
  function (test, expect) {
    Meteor.logout(expect((error) => {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  },
  function (test, expect) {
    Meteor.loginWithPassword(
      {email: this.email}, "newPassword",
      expect((error) => {
        test.isFalse(error);
      }));
  },
  function (test, expect) {
    Meteor.logout(expect((error) => {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  }
]);

var getVerifyEmailToken = function (email, test, expect) {
  Accounts.connection.call(
    "getInterceptedEmails", email, expect((error, result) => {
      test.equal(error, undefined);
      test.notEqual(result, undefined);
      test.equal(result.length, 1);
      var options = result[0];

      var re = new RegExp(Meteor.absoluteUrl() + "#/verify-email/(\\S*)");
      var match = options.text.match(re);
      test.isTrue(match);
      verifyEmailToken = match[1];
      test.isTrue(options.html.match(re));

      test.equal(options.from, 'test@meteor.com');
      test.equal(options.headers['My-Custom-Header'], 'Cool');
    }));
};

var loggedIn = function (test, expect) {
  return expect((error) => {
    test.equal(error, undefined);
    test.isTrue(Meteor.user());
  });
};

testAsyncMulti("accounts emails - verify email flow", [
  function (test, expect) {
    this.email = Random.id() + "-intercept@example.com";
    this.anotherEmail = Random.id() + "-intercept@example.com";
    Accounts.createUser(
      {email: this.email, password: 'foobar'},
      loggedIn(test, expect));
  },
  function (test, expect) {
    test.equal(Meteor.user().emails.length, 1);
    test.equal(Meteor.user().emails[0].address, this.email);
    test.isFalse(Meteor.user().emails[0].verified);
    // We should NOT be publishing things like verification tokens!
    test.isFalse(_.has(Meteor.user(), 'services'));
  },
  function (test, expect) {
    getVerifyEmailToken(this.email, test, expect);
  },
  function (test, expect) {
    // Log out, to test that verifyEmail logs us back in.
    Meteor.logout(expect((error) => {
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
    test.equal(Meteor.user().emails[0].address, this.email);
    test.isTrue(Meteor.user().emails[0].verified);
  },
  function (test, expect) {
    Accounts.connection.call(
      "addEmailForTestAndVerify", this.anotherEmail,
      expect((error, result) => {
        test.isFalse(error);
        test.equal(Meteor.user().emails.length, 2);
        test.equal(Meteor.user().emails[1].address, this.anotherEmail);
        test.isFalse(Meteor.user().emails[1].verified);
      }));
  },
  function (test, expect) {
    getVerifyEmailToken(this.anotherEmail, test, expect);
  },
  function (test, expect) {
    // Log out, to test that verifyEmail logs us back in. (And if we don't
    // do that, waitUntilLoggedIn won't be able to prevent race conditions.)
    Meteor.logout(expect((error) => {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  },
  function (test, expect) {
    Accounts.verifyEmail(verifyEmailToken,
                         loggedIn(test, expect));
  },
  function (test, expect) {
    test.equal(Meteor.user().emails[1].address, this.anotherEmail);
    test.isTrue(Meteor.user().emails[1].verified);
  },
  function (test, expect) {
    Meteor.logout(expect((error) => {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  }
]);

var getEnrollAccountToken = function (email, test, expect) {
  Accounts.connection.call(
    "getInterceptedEmails", email, expect((error, result) => {
      test.equal(error, undefined);
      test.notEqual(result, undefined);
      test.equal(result.length, 1);
      var options = result[0];

      var re = new RegExp(Meteor.absoluteUrl() + "#/enroll-account/(\\S*)")
      var match = options.text.match(re);
      test.isTrue(match);
      enrollAccountToken = match[1];
      test.isTrue(options.html.match(re));

      test.equal(options.from, 'test@meteor.com');
      test.equal(options.headers['My-Custom-Header'], 'Cool');
    }));
};

testAsyncMulti("accounts emails - enroll account flow", [
  function (test, expect) {
    this.email = Random.id() + "-intercept@example.com";
    Accounts.connection.call("createUserOnServer", this.email,
      expect((error, result) => {
        test.isFalse(error);
        var user = result;
        test.equal(user.emails.length, 1);
        test.equal(user.emails[0].address, this.email);
        test.isFalse(user.emails[0].verified);
      }));
  },
  function (test, expect) {
    getEnrollAccountToken(this.email, test, expect);
  },
  function (test, expect) {
    Accounts.resetPassword(enrollAccountToken, 'password',
                           loggedIn(test, expect));
  },
  function (test, expect) {
    test.equal(Meteor.user().emails.length, 1);
    test.equal(Meteor.user().emails[0].address, this.email);
    test.isTrue(Meteor.user().emails[0].verified);
  },
  function (test, expect) {
    Meteor.logout(expect((error) => {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  },
  function (test, expect) {
    Meteor.loginWithPassword({email: this.email}, 'password',
                             loggedIn(test ,expect));
  },
  function (test, expect) {
    test.equal(Meteor.user().emails.length, 1);
    test.equal(Meteor.user().emails[0].address, this.email);
    test.isTrue(Meteor.user().emails[0].verified);
  },
  function (test, expect) {
    Meteor.logout(expect((error) => {
      test.equal(error, undefined);
      test.equal(Meteor.user(), null);
    }));
  }
]);
