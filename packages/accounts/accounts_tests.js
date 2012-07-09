Tinytest.add('accounts - updateOrCreateUser', function (test) {
  Meteor.users.remove({});

  // test that emails are matched correctly for users logging in
  // through different services
  Meteor.accounts.updateOrCreateUser('foo@bar.com', {}, 'facebook', 1, {});
  Meteor.accounts.updateOrCreateUser('foo@bar.com', {}, 'google', 2, {});
  test.equal(
    Meteor.users.findOne({emails: 'foo@bar.com'}).services.facebook.id, 1);
  test.equal(
    Meteor.users.findOne({emails: 'foo@bar.com'}).services.google.id, 2);
});
