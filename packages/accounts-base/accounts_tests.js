Tinytest.add('accounts - updateOrCreateUser', function (test) {
  var facebookId = Meteor.uuid();
  var weiboId1 = Meteor.uuid();
  var weiboId2 = Meteor.uuid();


  // create an account with facebook
  var uid1 = Meteor.accounts.updateOrCreateUser(
    {services: {facebook: {id: facebookId}}}, {foo: 1});
  test.equal(Meteor.users.find({"services.facebook.id": facebookId}).count(), 1);
  test.equal(Meteor.users.findOne({"services.facebook.id": facebookId}).foo, 1);

  // create again with the same id, see that we get the same user
  var uid2 = Meteor.accounts.updateOrCreateUser(
    {services: {facebook: {id: facebookId}}}, {bar: 2});
  test.equal(uid1, uid2);
  test.equal(Meteor.users.find({"services.facebook.id": facebookId}).count(), 1);
  test.equal(Meteor.users.findOne(uid1).foo, 1);
  test.equal(Meteor.users.findOne(uid1).bar, 2);

  // cleanup
  Meteor.users.remove(uid1);


  // users that have different service ids get different users
  uid1 = Meteor.accounts.updateOrCreateUser(
    {services: {weibo: {id: weiboId1}}}, {foo: 1});
  uid2 = Meteor.accounts.updateOrCreateUser(
    {services: {weibo: {id: weiboId2}}}, {bar: 2});
  test.equal(Meteor.users.find({"services.weibo.id": {$in: [weiboId1, weiboId2]}}).count(), 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId1}).foo, 1);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId1}).emails, undefined);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId2}).bar, 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId2}).emails, undefined);

  // cleanup
  Meteor.users.remove(uid1);
  Meteor.users.remove(uid2);

});

