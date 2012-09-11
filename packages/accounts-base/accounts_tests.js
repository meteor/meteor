Tinytest.add('accounts - updateOrCreateUser', function (test) {
  var email = Meteor.uuid() + "@example.com";
  var email2 = Meteor.uuid() + "@example.com";
  var facebookId = Meteor.uuid();
  var googleId = Meteor.uuid();
  var weiboId1 = Meteor.uuid();
  var weiboId2 = Meteor.uuid();

  // test that emails are matched correctly for users logging in
  // through different services
  Meteor.accounts.updateOrCreateUser({email: email, services: {facebook: {id: facebookId}}});

  // twice just to make sure we don't accidentally duplicate email records
  Meteor.accounts.updateOrCreateUser({email: email, services: {google: {id: googleId}}});
  Meteor.accounts.updateOrCreateUser({email: email, services: {google: {id: googleId}}});

  test.equal(
    Meteor.users.findOne({"emails.email": email}).services.facebook.id, facebookId);
  test.equal(
    Meteor.users.findOne({"emails.email": email}).services.google.id, googleId);

  // test that if the user changes their email on the login service
  // we store the new one in addition to the old one
  Meteor.accounts.updateOrCreateUser({email: email2, services: {facebook: {id: facebookId}}});
  test.equal(
    Meteor.users.findOne({"emails.email": email}).emails,
    [{email: email, validated: true}, {email: email2, validated: true}]);

  // cleanup
  Meteor.users.remove({emails: {$in: [email, email2]}});

  // users with no email (such as on weibo) that have the same weibo
  // id get the same user
  Meteor.accounts.updateOrCreateUser({services: {weibo: {id: weiboId1}}}, {foo: 1});
  Meteor.accounts.updateOrCreateUser({services: {weibo: {id: weiboId1}}}, {bar: 2});
  test.equal(Meteor.users.find({"services.weibo.id": weiboId1}).count(), 1);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId1}).foo, 1);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId1}).bar, 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId1}).emails, []);

  // cleanup
  Meteor.users.remove({"services.weibo.id": weiboId1});

  // users with no email (such as on weibo) that have different weibo
  // ids get different users
  Meteor.accounts.updateOrCreateUser({services: {weibo: {id: weiboId1}}}, {foo: 1});
  Meteor.accounts.updateOrCreateUser({services: {weibo: {id: weiboId2}}}, {bar: 2});
  test.equal(Meteor.users.find({"services.weibo.id": {$in: [weiboId1, weiboId2]}}).count(), 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId1}).foo, 1);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId1}).emails, []);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId2}).bar, 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId2}).emails, []);
});
