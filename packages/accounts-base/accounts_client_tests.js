const username = 'jsmith';
const password = 'password';

const createUserAndLogin = (test, done, afterLoginCallback) => {
  Meteor.logout(() => {
    // Make sure we're logged out to start with
    test.isFalse(Meteor.user());

    // Setup a new test user
    Accounts.createUser({ username, password }, () => {
      // Login with that test user
      Meteor.loginWithPassword(username, password, () => {
        test.isTrue(Meteor.user());

        // loggingOut should be false before trying to logout
        test.isFalse(Meteor.loggingOut());

        // Handle after login tests
        afterLoginCallback(test, done);
      });
    });
  });

};

Tinytest.addAsync(
  'accounts - Meteor.loggingOut() is true right after a logout call',
  (test, done) => {
    createUserAndLogin(test, done, () => {
      // Logout then immediately verify loggingOut is true
      Meteor.logout();
      test.isTrue(Meteor.loggingOut());

      // Remove the test user
      Meteor.call('removeAccountsTestUser', username, () => {
        done();
      });
    });
  }
);

Tinytest.addAsync(
  'accounts - Meteor.loggingOut() is false after logout has completed',
  (test, done) => {
    createUserAndLogin(test, done, () => {
      // Logout then verify loggingOut is false after logout has completed
      Meteor.logout((error) => {
        test.isFalse(Meteor.user());
        test.isFalse(Meteor.loggingOut());

        // Remove the test user
        Meteor.call('removeAccountsTestUser', username, () => {
          done();
        });
      });
    });
  }
);
