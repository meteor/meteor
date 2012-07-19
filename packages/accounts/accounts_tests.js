Tinytest.add('accounts - updateOrCreateUser', function (test) {
  var email = Meteor.uuid() + "@example.com";
  var email2 = Meteor.uuid() + "@example.com";

  // test that emails are matched correctly for users logging in
  // through different services
  Meteor.accounts.updateOrCreateUser(email, {}, 'facebook', 1, {});
  Meteor.accounts.updateOrCreateUser(email, {}, 'google', 2, {});
  test.equal(
    Meteor.users.findOne({emails: email}).services.facebook.id, 1);
  test.equal(
    Meteor.users.findOne({emails: email}).services.google.id, 2);

  // test that if the user changes their email on the login service
  // we store the new one in addition to the old one
  Meteor.accounts.updateOrCreateUser(email2, {}, 'facebook', 1, {});
  test.equal(
    Meteor.users.findOne({emails: email}).emails,
    [email, email2]);

  // clean
  Meteor.users.remove({emails: {$in: [email, email2]}});

  // users with no email (such as on weibo) that have the same weibo
  // id get the same user
  Meteor.accounts.updateOrCreateUser(null, {foo: 1}, 'weibo', 1, {});
  Meteor.accounts.updateOrCreateUser(null, {bar: 2}, 'weibo', 1, {});
  test.equal(Meteor.users.find({"services.weibo.id": 1}).count(), 1);
  test.equal(Meteor.users.findOne({"services.weibo.id": 1}).foo, 1);
  test.equal(Meteor.users.findOne({"services.weibo.id": 1}).bar, 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": 1}).emails, []);

  // clean
  Meteor.users.remove({"services.weibo.id": 1});

  // users with no email (such as on weibo) that have different weibo
  // ids get different users
  Meteor.accounts.updateOrCreateUser(null, {foo: 1}, 'weibo', 1, {});
  Meteor.accounts.updateOrCreateUser(null, {bar: 2}, 'weibo', 2, {});
  test.equal(Meteor.users.find({"services.weibo.id": {$in: [1, 2]}}).count(), 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": 1}).foo, 1);
  test.equal(Meteor.users.findOne({"services.weibo.id": 1}).emails, []);
  test.equal(Meteor.users.findOne({"services.weibo.id": 2}).bar, 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": 2}).emails, []);
});
