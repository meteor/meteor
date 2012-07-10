Tinytest.add('accounts - updateOrCreateUser', function (test) {
  // test that emails are matched correctly for users logging in
  // through different services
  Meteor.users.remove({});
  Meteor.accounts.updateOrCreateUser('foo@bar.com', {}, 'facebook', 1, {});
  Meteor.accounts.updateOrCreateUser('foo@bar.com', {}, 'google', 2, {});
  test.equal(
    Meteor.users.findOne({emails: 'foo@bar.com'}).services.facebook.id, 1);
  test.equal(
    Meteor.users.findOne({emails: 'foo@bar.com'}).services.google.id, 2);

  // test that if the user changes their email on the login service
  // we store the new one in addition to the old one
  Meteor.accounts.updateOrCreateUser('foo2@bar.com', {}, 'facebook', 1, {});
  test.equal(
    Meteor.users.findOne({emails: 'foo@bar.com'}).emails,
    ['foo@bar.com', 'foo2@bar.com']);

  // users with no email (such as on weibo) that have the same weibo
  // id get the same user
  Meteor.users.remove({});
  Meteor.accounts.updateOrCreateUser(null, {foo: 1}, 'weibo', 1, {});
  Meteor.accounts.updateOrCreateUser(null, {bar: 2}, 'weibo', 1, {});
  test.equal(Meteor.users.find().count(), 1);
  test.equal(Meteor.users.findOne().foo, 1);
  test.equal(Meteor.users.findOne().bar, 2);
  test.equal(Meteor.users.findOne().emails, []);

  // users with no email (such as on weibo) that have different weibo
  // ids get different users
  Meteor.users.remove({});
  Meteor.accounts.updateOrCreateUser(null, {foo: 1}, 'weibo', 1, {});
  Meteor.accounts.updateOrCreateUser(null, {bar: 2}, 'weibo', 2, {});
  test.equal(Meteor.users.find().count(), 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": 1}).foo, 1);
  test.equal(Meteor.users.findOne({"services.weibo.id": 1}).emails, []);
  test.equal(Meteor.users.findOne({"services.weibo.id": 2}).bar, 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": 2}).emails, []);
});
