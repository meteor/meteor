const username = 'jsmith';
const password = 'password';

const logoutAndCreateUser = (test, done, nextTests) => {
  Meteor.logout(() => {
    // Make sure we're logged out to start with
    test.isFalse(Meteor.user());

    // Setup a new test user
    Accounts.createUser({ username, password }, () => {
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
