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