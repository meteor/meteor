Tinytest.add('accounts - updateOrCreateUser', function (test) {
  var email = Meteor.uuid() + "@example.com";
  var email2 = Meteor.uuid() + "@example.com";

  // XXX test isolation fail! these tests use a fixed google, facebook,
  // and weibo ids. This won't work with multiple tests running at once.

  // test that emails are matched correctly for users logging in
  // through different services
  Meteor.accounts.updateOrCreateUser({email: email, services: {facebook: {id: 1}}});
  Meteor.accounts.updateOrCreateUser({email: email, services: {google: {id: 2}}});
  test.equal(
    Meteor.users.findOne({emails: email}).services.facebook.id, 1);
  test.equal(
    Meteor.users.findOne({emails: email}).services.google.id, 2);

  // test that if the user changes their email on the login service
  // we store the new one in addition to the old one
  Meteor.accounts.updateOrCreateUser({email: email2, services: {facebook: {id: 1}}});
  test.equal(
    Meteor.users.findOne({emails: email}).emails,
    [email, email2]);

  // cleanup
  Meteor.users.remove({emails: {$in: [email, email2]}});

  // users with no email (such as on weibo) that have the same weibo
  // id get the same user
  Meteor.accounts.updateOrCreateUser({services: {weibo: {id: 1}}}, {foo: 1});
  Meteor.accounts.updateOrCreateUser({services: {weibo: {id: 1}}}, {bar: 2});
  test.equal(Meteor.users.find({"services.weibo.id": 1}).count(), 1);
  test.equal(Meteor.users.findOne({"services.weibo.id": 1}).foo, 1);
  test.equal(Meteor.users.findOne({"services.weibo.id": 1}).bar, 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": 1}).emails, []);

  // cleanup
  Meteor.users.remove({"services.weibo.id": 1});

  // users with no email (such as on weibo) that have different weibo
  // ids get different users
  Meteor.accounts.updateOrCreateUser({services: {weibo: {id: 1}}}, {foo: 1});
  Meteor.accounts.updateOrCreateUser({services: {weibo: {id: 2}}}, {bar: 2});
  test.equal(Meteor.users.find({"services.weibo.id": {$in: [1, 2]}}).count(), 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": 1}).foo, 1);
  test.equal(Meteor.users.findOne({"services.weibo.id": 1}).emails, []);
  test.equal(Meteor.users.findOne({"services.weibo.id": 2}).bar, 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": 2}).emails, []);
});
