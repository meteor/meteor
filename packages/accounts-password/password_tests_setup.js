Accounts.validateNewUser(function (user) {
  if (user.profile && user.profile.invalidAndThrowException)
    throw new Meteor.Error(403, "An exception thrown within Accounts.validateNewUser");
  return !(user.profile && user.profile.invalid);
});

Accounts.onCreateUser(function (options, user) {
  if (options.testOnCreateUserHook) {
    user.profile = user.profile || {};
    user.profile.touchedByOnCreateUser = true;
    return user;
  } else {
    return 'TEST DEFAULT HOOK';
  }
});


// connection id -> true
var invalidateLogins = {};


Meteor.methods({
  testInvalidateLogins: function (flag) {
    if (flag)
      invalidateLogins[this.connection.id] = true;
    else
      delete invalidateLogins[this.connection.id];
  }
});


Accounts.validateLoginAttempt(function (attempt) {
  return ! (attempt &&
            attempt.connection &&
            invalidateLogins[attempt.connection.id]);
});


// connection id -> [{successful: boolean, attempt: object}]
var capturedLogins = {};

Meteor.methods({
  testCaptureLogins: function () {
    capturedLogins[this.connection.id] = [];
  },

  testFetchCapturedLogins: function () {
    if (capturedLogins[this.connection.id]) {
      var logins = capturedLogins[this.connection.id];
      delete capturedLogins[this.connection.id];
      return logins;
    }
    else
      return [];
  }
});

Accounts.onLogin(function (attempt) {
  if (capturedLogins[attempt.connection.id])
    capturedLogins[attempt.connection.id].push({
      successful: true,
      attempt: _.omit(attempt, 'connection')
    });
});

Accounts.onLoginFailure(function (attempt) {
  if (capturedLogins[attempt.connection.id]) {
    capturedLogins[attempt.connection.id].push({
      successful: false,
      attempt: _.omit(attempt, 'connection')
    });
  }
});

// Because this is global state that affects every client, we can't turn
// it on and off during the tests. Doing so would mean two simultaneous
// test runs could collide with each other.
//
// We should probably have some sort of server-isolation between
// multiple test runs. Perhaps a separate server instance per run. This
// problem isn't unique to this test, there are other places in the code
// where we do various hacky things to work around the lack of
// server-side isolation.
//
// For now, we just test the one configuration state. You can comment
// out each configuration option and see that the tests fail.
Accounts.config({
  sendVerificationEmail: true
});


Meteor.methods({
  testMeteorUser: function () { return Meteor.user(); },
  clearUsernameAndProfile: function () {
    if (!this.userId)
      throw new Error("Not logged in!");
    Meteor.users.update(this.userId,
                        {$unset: {profile: 1, username: 1}});
  },

  expireTokens: function () {
    Accounts._expireTokens(new Date(), this.userId);
  },
  removeUser: function (username) {
    Meteor.users.remove({ "username": username });
  }
});
