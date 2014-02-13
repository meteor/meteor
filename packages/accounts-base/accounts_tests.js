// XXX it'd be cool to also test that the right thing happens if options
// *are* validated, but Accounts._options is global state which makes this hard
// (impossible?)
Tinytest.add('accounts - config validates keys', function (test) {
  test.throws(function () {
    Accounts.config({foo: "bar"});
  });
});


var idsInValidateNewUser = {};
Accounts.validateNewUser(function (user) {
  idsInValidateNewUser[user._id] = true;
  return true;
});

Tinytest.add('accounts - validateNewUser gets passed user with _id', function (test) {
  var newUserId = Accounts.updateOrCreateUserFromExternalService('foobook', {id: Random.id()}).id;
  test.isTrue(newUserId in idsInValidateNewUser);
});

Tinytest.add('accounts - updateOrCreateUserFromExternalService - Facebook', function (test) {
  var facebookId = Random.id();

  // create an account with facebook
  var uid1 = Accounts.updateOrCreateUserFromExternalService(
    'facebook', {id: facebookId, monkey: 42}, {profile: {foo: 1}}).id;
  var users = Meteor.users.find({"services.facebook.id": facebookId}).fetch();
  test.length(users, 1);
  test.equal(users[0].profile.foo, 1);
  test.equal(users[0].services.facebook.monkey, 42);

  // create again with the same id, see that we get the same user.
  // it should update services.facebook but not profile.
  var uid2 = Accounts.updateOrCreateUserFromExternalService(
    'facebook', {id: facebookId, llama: 50},
    {profile: {foo: 1000, bar: 2}}).id;
  test.equal(uid1, uid2);
  users = Meteor.users.find({"services.facebook.id": facebookId}).fetch();
  test.length(users, 1);
  test.equal(users[0].profile.foo, 1);
  test.equal(users[0].profile.bar, undefined);
  test.equal(users[0].services.facebook.llama, 50);
  // make sure we *don't* lose values not passed this call to
  // updateOrCreateUserFromExternalService
  test.equal(users[0].services.facebook.monkey, 42);

  // cleanup
  Meteor.users.remove(uid1);
});

Tinytest.add('accounts - updateOrCreateUserFromExternalService - Weibo', function (test) {
  var weiboId1 = Random.id();
  var weiboId2 = Random.id();

  // users that have different service ids get different users
  var uid1 = Accounts.updateOrCreateUserFromExternalService(
    'weibo', {id: weiboId1}, {profile: {foo: 1}}).id;
  var uid2 = Accounts.updateOrCreateUserFromExternalService(
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

Tinytest.add('accounts - updateOrCreateUserFromExternalService - Twitter', function (test) {
  var twitterIdOld = parseInt(Random.hexString(4), 16);
  var twitterIdNew = ''+twitterIdOld;

  // create an account with twitter using the old ID format of integer
  var uid1 = Accounts.updateOrCreateUserFromExternalService(
    'twitter', {id: twitterIdOld, monkey: 42}, {profile: {foo: 1}}).id;
  var users = Meteor.users.find({"services.twitter.id": twitterIdOld}).fetch();
  test.length(users, 1);
  test.equal(users[0].profile.foo, 1);
  test.equal(users[0].services.twitter.monkey, 42);

  // Update the account with the new ID format of string
  // test that the existing user is found, and that the ID
  // gets updated to a string value
  var uid2 = Accounts.updateOrCreateUserFromExternalService(
    'twitter', {id: twitterIdNew, monkey: 42}, {profile: {foo: 1}}).id;
  test.equal(uid1, uid2);
  users = Meteor.users.find({"services.twitter.id": twitterIdNew}).fetch();
  test.length(users, 1);

  // cleanup
  Meteor.users.remove(uid1);
});


Tinytest.add('accounts - insertUserDoc username', function (test) {
  var userIn = {
    username: Random.id()
  };

  // user does not already exist. create a user object with fields set.
  var result = Accounts.insertUserDoc(
    {profile: {name: 'Foo Bar'}},
    userIn
  );
  var userOut = Meteor.users.findOne(result.id);

  test.equal(typeof userOut.createdAt, 'object');
  test.equal(userOut.profile.name, 'Foo Bar');
  test.equal(userOut.username, userIn.username);

  // run the hook again. now the user exists, so it throws an error.
  test.throws(function () {
    Accounts.insertUserDoc(
      {profile: {name: 'Foo Bar'}},
      userIn
    );
  });

  // cleanup
  Meteor.users.remove(result.id);

});

Tinytest.add('accounts - insertUserDoc email', function (test) {
  var email1 = Random.id();
  var email2 = Random.id();
  var email3 = Random.id();
  var userIn = {
    emails: [{address: email1, verified: false},
             {address: email2, verified: true}]
  };

  // user does not already exist. create a user object with fields set.
  var result = Accounts.insertUserDoc(
    {profile: {name: 'Foo Bar'}},
    userIn
  );
  var userOut = Meteor.users.findOne(result.id);

  test.equal(typeof userOut.createdAt, 'object');
  test.equal(userOut.profile.name, 'Foo Bar');
  test.equal(userOut.emails, userIn.emails);

  // run the hook again with the exact same emails.
  // run the hook again. now the user exists, so it throws an error.
  test.throws(function () {
    Accounts.insertUserDoc(
      {profile: {name: 'Foo Bar'}},
      userIn
    );
  });

  // now with only one of them.
  test.throws(function () {
    Accounts.insertUserDoc(
      {}, {emails: [{address: email1}]}
    );
  });

  test.throws(function () {
    Accounts.insertUserDoc(
      {}, {emails: [{address: email2}]}
    );
  });


  // a third email works.
  var result3 = Accounts.insertUserDoc(
      {}, {emails: [{address: email3}]}
  );
  var user3 = Meteor.users.findOne(result3.id);
  test.equal(typeof user3.createdAt, 'object');

  // cleanup
  Meteor.users.remove(result.id);
  Meteor.users.remove(result3.id);
});

// More token expiration tests are in accounts-password
Tinytest.addAsync('accounts - expire numeric token', function (test, onComplete) {
  var userIn = { username: Random.id() };
  var result = Accounts.insertUserDoc({ profile: {
    name: 'Foo Bar'
  } }, userIn);
  var date = new Date(new Date() - 5000);
  Meteor.users.update(result.id, {
    $set: {
      "services.resume.loginTokens": [{
        hashedToken: Random.id(),
        when: date
      }, {
        hashedToken: Random.id(),
        when: +date
      }]
    }
  });
  var observe = Meteor.users.find(result.id).observe({
    changed: function (newUser) {
      if (newUser.services && newUser.services.resume &&
          _.isEmpty(newUser.services.resume.loginTokens)) {
        observe.stop();
        onComplete();
      }
    }
  });
  Accounts._expireTokens(new Date(), result.id);
});


// Login tokens used to be stored unhashed in the database.  We want
// to make sure users can still login after upgrading.

var userWithUnhashedLoginToken = function () {
  var result = Accounts.insertUserDoc({}, {username: Random.id()});

  // Construct an old-style unhashed login token.
  var stampedToken = Accounts._generateStampedLoginToken();

  Meteor.users.update(
    result.id,
    {$push: {'services.resume.loginTokens': stampedToken}}
  );

  // Return result, as if from Accounts.insertUserDoc.
  result.token = stampedToken.token;
  result.tokenExpires = Accounts._tokenExpiration(stampedToken.when);
  return result;
};

Tinytest.addAsync('accounts - login token', function (test, onComplete) {
  // Test that we can login when the database contains a leftover
  // old style unhashed login token.
  var user1 = userWithUnhashedLoginToken();
  var connection = DDP.connect(Meteor.absoluteUrl());
  connection.call('login', {resume: user1.token});
  connection.disconnect();

  // Steal the unhashed token from the database and use it to login.
  // This is a sanity check so that when we *can't* login with a
  // stolen *hashed* token, we know it's not a problem with the test.
  var user2 = userWithUnhashedLoginToken();
  var stolenToken = Meteor.users.findOne(user2.id).services.resume.loginTokens[0].token;
  test.isTrue(stolenToken);
  connection = DDP.connect(Meteor.absoluteUrl());
  connection.call('login', {resume: stolenToken});
  connection.disconnect();

  // Now do the same thing, this time with a stolen hashed token.
  var user3 = Accounts.insertUserDoc({generateLoginToken: true}, {username: Random.id()});
  stolenToken = Meteor.users.findOne(user3.id).services.resume.loginTokens[0].hashedToken;
  test.isTrue(stolenToken);
  connection = DDP.connect(Meteor.absoluteUrl());
  // evil plan foiled
  test.throws(
    function () {
      connection.call('login', {resume: stolenToken});
    },
    /You\'ve been logged out by the server/
  );
  connection.disconnect();

  // Old style unhashed tokens are replaced by hashed tokens when
  // encountered.  This means that after someone logins once, the
  // old unhashed token is no longer available to be stolen.
  var user4 = userWithUnhashedLoginToken();
  connection = DDP.connect(Meteor.absoluteUrl());
  connection.call('login', {resume: user4.token});
  connection.disconnect();

  // The token is no longer available to be stolen.
  stolenToken = Meteor.users.findOne(user4.id).services.resume.loginTokens[0].token;
  test.isFalse(stolenToken);

  // After the upgrade, the client can still login with their login token.
  connection = DDP.connect(Meteor.absoluteUrl());
  connection.call('login', {resume: user4.token});
  connection.disconnect();

  onComplete();
});

Tinytest.addAsync(
  'accounts - connection data cleaned up',
  function (test, onComplete) {
    makeTestConnection(
      test,
      function (clientConn, serverConn) {
        // onClose callbacks are called in order, so we run after the
        // close callback in accounts.
        serverConn.onClose(function () {
          test.isFalse(Accounts._getAccountData(serverConn.id, 'connection'));
          onComplete();
        });

        test.isTrue(Accounts._getAccountData(serverConn.id, 'connection'));
        serverConn.close();
      },
      onComplete
    );
  }
);
