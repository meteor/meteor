Meteor.accounts.validateNewUser(function (user) {
  return !user.invalid;
});

Meteor.accounts.onCreateUser(function (options, extra, user) {
  if (extra.testOnCreateUserHook) {
    user.touchedByOnCreateUser = true;
    return user;
  } else {
    return 'TEST DEFAULT HOOK';
  }
});

Meteor.methods({
  setupMoreThanOneOnCreateUserHook: function () {
    try {
      Meteor.accounts.onCreateUser(function () {});
    } catch (exception) {
      throw new Meteor.Error(999, "Test exception");
    }
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
Meteor.accounts.config({
  unsafePasswordChanges: true,
  // The 'accounts - updateOrCreateUser' test needs accounts without
  // usernames or emails, so we can't test with these on.
  requireEmail: false,
  requireUsername: false
});
