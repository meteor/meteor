const username = 'jsmith';
const password = 'password';
const excludeField = 'excludeField';
const defaultExcludeField = 'defaultExcludeField';
const excludeValue = 'foo';
const profile = {
  name: username,
  [excludeField]: excludeValue,
  [defaultExcludeField]: excludeValue,
}

const logoutAndCreateUser = (test, done, nextTests) => {
  Meteor.logout(() => {
    // Make sure we're logged out to start with
    test.isFalse(Meteor.user());

    // Setup a new test user
    Accounts.createUser({ username, password, profile }, () => {
      // Handle next tests
      nextTests(test, done);
    });
  });
};

const removeTestUser = (done) => {
  Meteor.call('removeAccountsTestUser', username, () => {
    done();
  });
};

Tinytest.addAsync(
  'accounts - Meteor.loggingIn() is true right after a login call',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      // Login then immediately verify loggingIn is true
      Meteor.loginWithPassword(username, password);
      test.isTrue(Meteor.loggingIn());
      removeTestUser(done);
    });
  }
);

Tinytest.addAsync(
  'accounts - Meteor.loggingIn() is false after login has completed',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      // Login then verify loggingIn is false after login has completed
      Meteor.loginWithPassword(username, password, () => {
        test.isTrue(Meteor.user());
        test.isFalse(Meteor.loggingIn());
        removeTestUser(done);
      });
    });
  }
);

Tinytest.addAsync(
  'accounts - Meteor.loggingOut() is true right after a logout call',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      // Logout then immediately verify loggingOut is true
      Meteor.logout();
      test.isTrue(Meteor.loggingOut());
      removeTestUser(done);
    });
  }
);

Tinytest.addAsync(
  'accounts - Meteor.loggingOut() is false after logout has completed',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      // Logout then verify loggingOut is false after logout has completed
      Meteor.logout((error) => {
        test.isFalse(Meteor.user());
        test.isFalse(Meteor.loggingOut());
        removeTestUser(done);
      });
    });
  }
);

Tinytest.addAsync(
  'accounts - onLogin callback receives { type: "password" } param on login',
  (test, done) => {
    const onLogin = Accounts.onLogin((loginDetails) => {
      test.equal('password', loginDetails.type);
      onLogin.stop();
      removeTestUser(done);
    });
    logoutAndCreateUser(test, done, () => {});
  }
);

Tinytest.addAsync(
  'accounts - onLogin callback receives { type: "resume" } param on ' +
  'reconnect, if already logged in',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      const onLogin = Accounts.onLogin((loginDetails) => {
        test.equal('resume', loginDetails.type);
        onLogin.stop();
        removeTestUser(done);
      });

      Meteor.disconnect();
      Meteor.reconnect();
    });
  }
);

Tinytest.addAsync(
  'accounts - Meteor.user obeys explicit and default field selectors',
  (test, done) => {
    logoutAndCreateUser(test, done, () => {
      Meteor.loginWithPassword(username, password, () => {
        // by default, all fields should be returned
        test.equal(Meteor.user().profile[excludeField], excludeValue);

        // this time we want to exclude the default fields
        const options = Accounts._options;
        Accounts._options = {};
        Accounts.config({defaultFieldSelector: {['profile.'+defaultExcludeField]: 0}});
        let user = Meteor.user();
        test.isUndefined(user.profile[defaultExcludeField]);
        test.equal(user.profile[excludeField], excludeValue);
        test.equal(user.profile.name, username);

        // this time we only want certain fields...
        user = Meteor.user({fields: {'profile.name': 1}});
        test.isUndefined(user.profile[excludeField]);
        test.isUndefined(user.profile[defaultExcludeField]);
        test.equal(user.profile.name, username);
        Accounts._options = options;
        removeTestUser(done);
      });
    });
  }
);
