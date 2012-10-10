Tinytest.add('accounts - updateOrCreateUserFromExternalService', function (test) {
  var facebookId = Meteor.uuid();
  var weiboId1 = Meteor.uuid();
  var weiboId2 = Meteor.uuid();


  // create an account with facebook
  var uid1 = Accounts.updateOrCreateUserFromExternalService(
    'facebook', {id: facebookId}, {profile: {foo: 1}}).id;
  test.equal(Meteor.users.find({"services.facebook.id": facebookId}).count(), 1);
  test.equal(Meteor.users.findOne({"services.facebook.id": facebookId}).profile.foo, 1);

  // create again with the same id, see that we get the same user. profile
  // doesn't get overwritten in this implementation (though we should do
  // something better with merging later).
  var uid2 = Accounts.updateOrCreateUserFromExternalService(
    'facebook', {id: facebookId}, {profile: {foo: 1000, bar: 2}}).id;
  test.equal(uid1, uid2);
  test.equal(Meteor.users.find({"services.facebook.id": facebookId}).count(), 1);
  test.equal(Meteor.users.findOne(uid1).profile.foo, 1);
  test.equal(Meteor.users.findOne(uid1).profile.bar, undefined);

  // cleanup
  Meteor.users.remove(uid1);


  // users that have different service ids get different users
  uid1 = Accounts.updateOrCreateUserFromExternalService(
    'weibo', {id: weiboId1}, {profile: {foo: 1}}).id;
  uid2 = Accounts.updateOrCreateUserFromExternalService(
    'weibo', {id: weiboId2}, {profile: {bar: 2}}).id;
  test.equal(Meteor.users.find({"services.weibo.id": {$in: [weiboId1, weiboId2]}}).count(), 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId1}).profile.foo, 1);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId1}).emails, undefined);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId2}).profile.bar, 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId2}).emails, undefined);

  // cleanup
  Meteor.users.remove(uid1);
  Meteor.users.remove(uid2);

});

Tinytest.add('accounts - insertUserDoc username', function (test) {
  var userIn = {
    username: Meteor.uuid()
  };

  // user does not already exist. create a user object with fields set.
  var result = Accounts.insertUserDoc(
    userIn,
    {profile: {name: 'Foo Bar'}},
    userIn
  );
  var userOut = Meteor.users.findOne(result.id);

  test.equal(typeof userOut.createdAt, 'number');
  test.equal(userOut.profile.name, 'Foo Bar');
  test.equal(userOut.username, userIn.username);

  // run the hook again. now the user exists, so it throws an error.
  test.throws(function () {
    Accounts.insertUserDoc(
      userIn,
      {profile: {name: 'Foo Bar'}},
      userIn
    );
  });

  // cleanup
  Meteor.users.remove(result.id);

});

Tinytest.add('accounts - insertUserDoc email', function (test) {
  var email1 = Meteor.uuid();
  var email2 = Meteor.uuid();
  var email3 = Meteor.uuid();
  var userIn = {
    emails: [{address: email1, verified: false},
             {address: email2, verified: true}]
  };

  // user does not already exist. create a user object with fields set.
  var result = Accounts.insertUserDoc(
    userIn,
    {profile: {name: 'Foo Bar'}},
    userIn
  );
  var userOut = Meteor.users.findOne(result.id);

  test.equal(typeof userOut.createdAt, 'number');
  test.equal(userOut.profile.name, 'Foo Bar');
  test.equal(userOut.emails, userIn.emails);

  // run the hook again with the exact same emails.
  // run the hook again. now the user exists, so it throws an error.
  test.throws(function () {
    Accounts.insertUserDoc(
      userIn,
      {profile: {name: 'Foo Bar'}},
      userIn
    );
  });

  // now with only one of them.
  test.throws(function () {
    Accounts.insertUserDoc(
      {}, {}, {emails: [{address: email1}]}
    );
  });

  test.throws(function () {
    Accounts.insertUserDoc(
      {}, {}, {emails: [{address: email2}]}
    );
  });


  // a third email works.
  var result3 = Accounts.insertUserDoc(
      {}, {}, {emails: [{address: email3}]}
  );
  var user3 = Meteor.users.findOne(result3.id);
  test.equal(typeof user3.createdAt, 'number');

  // cleanup
  Meteor.users.remove(result.id);
  Meteor.users.remove(result3.id);
});
