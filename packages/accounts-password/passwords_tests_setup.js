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


// This test properly belongs in accounts-base/accounts_tests.js, but
// this is where the tests that actually log in are.
Meteor.methods({
  testMeteorUser: function () { return Meteor.user(); },
  clearUsernameAndProfile: function () {
    if (!this.userId)
      throw new Error("Not logged in!");
    Meteor.users.update(this.userId,
                        {$unset: {profile: 1, username: 1}});
  }
});
