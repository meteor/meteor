Tinytest.add('accounts - updateOrCreateUserFromExternalService', function (test) {
  var facebookId = Meteor.uuid();
  var weiboId1 = Meteor.uuid();
  var weiboId2 = Meteor.uuid();


  // create an account with facebook
  var uid1 = Accounts.updateOrCreateUserFromExternalService(
    'facebook', {id: facebookId}, {foo: 1}).id;
  test.equal(Meteor.users.find({"services.facebook.id": facebookId}).count(), 1);
  test.equal(Meteor.users.findOne({"services.facebook.id": facebookId}).foo, 1);

  // create again with the same id, see that we get the same user
  var uid2 = Accounts.updateOrCreateUserFromExternalService(
    'facebook', {id: facebookId}, {foo: 1000, bar: 2}).id; // foo: 1000 shouldn't overwrite
  test.equal(uid1, uid2);
  test.equal(Meteor.users.find({"services.facebook.id": facebookId}).count(), 1);
  test.equal(Meteor.users.findOne(uid1).foo, 1);
  test.equal(Meteor.users.findOne(uid1).bar, 2);

  // cleanup
  Meteor.users.remove(uid1);


  // users that have different service ids get different users
  uid1 = Accounts.updateOrCreateUserFromExternalService(
    'weibo', {id: weiboId1}, {foo: 1}).id;
  uid2 = Accounts.updateOrCreateUserFromExternalService(
    'weibo', {id: weiboId2}, {bar: 2}).id;
  test.equal(Meteor.users.find({"services.weibo.id": {$in: [weiboId1, weiboId2]}}).count(), 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId1}).foo, 1);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId1}).emails, undefined);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId2}).bar, 2);
  test.equal(Meteor.users.findOne({"services.weibo.id": weiboId2}).emails, undefined);

  // cleanup
  Meteor.users.remove(uid1);
  Meteor.users.remove(uid2);

});

Tinytest.add('accounts - onCreateUserHook username', function (test) {
  var userIn = {
    username: Meteor.uuid()
  };

  // user does not already exist. return a user object with fields set.
  var userOut = Accounts.onCreateUserHook(
    userIn,
    {profile: {name: 'Foo Bar'}},
    userIn
  );

  test.equal(typeof userOut.createdAt, 'number');
  test.equal(userOut.profile.name, 'Foo Bar');
  test.equal(userOut.username, userIn.username);

  // insert the user
  var uid = Meteor.users.insert(userOut);

  // run the hook again. now the user exists, so it throws an error.
  test.throws(function () {
    Accounts.onCreateUserHook(
      userIn,
      {profile: {name: 'Foo Bar'}},
      userIn
    );
  });

  // cleanup
  Meteor.users.remove(uid);

});

Tinytest.add('accounts - onCreateUserHook email', function (test) {
  var email1 = Meteor.uuid();
  var email2 = Meteor.uuid();
  var email3 = Meteor.uuid();
  var userIn = {
    emails: [{address: email1, verified: false},
             {address: email2, verified: true}]
  };

  // user does not already exist. return a user object with fields set.
  var userOut = Accounts.onCreateUserHook(
    userIn,
    {profile: {name: 'Foo Bar'}},
    userIn
  );

  test.equal(typeof userOut.createdAt, 'number');
  test.equal(userOut.profile.name, 'Foo Bar');
  test.equal(userOut.emails, userIn.emails);

  // insert the user
  var uid = Meteor.users.insert(userOut);

  // run the hook again with the exact same emails.
  // run the hook again. now the user exists, so it throws an error.
  test.throws(function () {
    Accounts.onCreateUserHook(
      userIn,
      {profile: {name: 'Foo Bar'}},
      userIn
    );
  });

  // now with only one of them.
  test.throws(function () {
    Accounts.onCreateUserHook(
      {}, {}, {emails: [{address: email1}]}
    );
  });

  test.throws(function () {
    Accounts.onCreateUserHook(
      {}, {}, {emails: [{address: email2}]}
    );
  });


  // a third email works.
  var user3 = Accounts.onCreateUserHook(
      {}, {}, {emails: [{address: email3}]}
  );
  test.equal(typeof userOut.createdAt, 'number');


  // cleanup
  Meteor.users.remove(uid);

});
