Meteor.methods({
  getCurrentLoginToken: function () {
    return Accounts._getLoginToken(this.connection.id);
  }
});

// XXX it'd be cool to also test that the right thing happens if options
// *are* validated, but Accounts._options is global state which makes this hard
// (impossible?)
Tinytest.add('accounts - config validates keys', function (test) {
  test.throws(function () {
    Accounts.config({foo: "bar"});
  });
});

Tinytest.add('accounts - config - token lifetime', function (test) {
  const loginExpirationInDays = Accounts._options.loginExpirationInDays;
  Accounts._options.loginExpirationInDays = 2;
  test.equal(Accounts._getTokenLifetimeMs(), 2 * 24 * 60 * 60 * 1000);
  Accounts._options.loginExpirationInDays = loginExpirationInDays;
});

Tinytest.add('accounts - config - unexpiring tokens', function (test) {
  const loginExpirationInDays = Accounts._options.loginExpirationInDays;

  // When setting loginExpirationInDays to null in the global Accounts
  // config object, make sure the returned token lifetime represents an
  // unexpiring token date (is very far into the future).
  Accounts._options.loginExpirationInDays = null;
  test.equal(
    Accounts._getTokenLifetimeMs(),
    Accounts.LOGIN_UNEXPIRING_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  );

  // Verify token expiration date retrieval returns a Date.
  // (verifies https://github.com/meteor/meteor/issues/9066)
  test.isTrue(
    !isNaN(Accounts._tokenExpiration(new Date())),
    'Returned token expiration should be a Date',
  );

  // Verify the token expiration check works properly.
  // (verifies https://github.com/meteor/meteor/issues/9066)
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 200);
  test.isFalse(Accounts._tokenExpiresSoon(futureDate));

  Accounts._options.loginExpirationInDays = loginExpirationInDays;
});

Tinytest.add('accounts - config - default token lifetime', function (test) {
  const options = Accounts._options;
  Accounts._options = {};
  test.equal(
    Accounts._getTokenLifetimeMs(),
    Accounts.DEFAULT_LOGIN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
  );
  Accounts._options = options;
});

var idsInValidateNewUser = {};
Accounts.validateNewUser(function (user) {
  idsInValidateNewUser[user._id] = true;
  return true;
});

Tinytest.add('accounts - validateNewUser gets passed user with _id', function (test) {
  var newUserId = Accounts.updateOrCreateUserFromExternalService('foobook', {id: Random.id()}).userId;
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
  var userId = Accounts.insertUserDoc(
    {profile: {name: 'Foo Bar'}},
    userIn
  );
  var userOut = Meteor.users.findOne(userId);

  test.equal(typeof userOut.createdAt, 'object');
  test.equal(userOut.profile.name, 'Foo Bar');
  test.equal(userOut.username, userIn.username);

  // run the hook again. now the user exists, so it throws an error.
  test.throws(function () {
    Accounts.insertUserDoc(
      {profile: {name: 'Foo Bar'}},
      userIn
    );
  }, 'Username already exists.');

  // cleanup
  Meteor.users.remove(userId);
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
  var userId = Accounts.insertUserDoc(
    {profile: {name: 'Foo Bar'}},
    userIn
  );
  var userOut = Meteor.users.findOne(userId);

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
  }, 'Email already exists.');

  // now with only one of them.
  test.throws(function () {
    Accounts.insertUserDoc(
      {}, {emails: [{address: email1}]}
    );
  }, 'Email already exists.');

  test.throws(function () {
    Accounts.insertUserDoc(
      {}, {emails: [{address: email2}]}
    );
  }, 'Email already exists.');


  // a third email works.
  var userId3 = Accounts.insertUserDoc(
      {}, {emails: [{address: email3}]}
  );
  var user3 = Meteor.users.findOne(userId3);
  test.equal(typeof user3.createdAt, 'object');

  // cleanup
  Meteor.users.remove(userId);
  Meteor.users.remove(userId3);
});

// More token expiration tests are in accounts-password
Tinytest.addAsync('accounts - expire numeric token', function (test, onComplete) {
  var userIn = { username: Random.id() };
  var userId = Accounts.insertUserDoc({ profile: {
    name: 'Foo Bar'
  } }, userIn);
  var date = new Date(new Date() - 5000);
  Meteor.users.update(userId, {
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
  var observe = Meteor.users.find(userId).observe({
    changed: function (newUser) {
      if (newUser.services && newUser.services.resume &&
          _.isEmpty(newUser.services.resume.loginTokens)) {
        observe.stop();
        onComplete();
      }
    }
  });
  Accounts._expireTokens(new Date(), userId);
});


// Login tokens used to be stored unhashed in the database.  We want
// to make sure users can still login after upgrading.
var insertUnhashedLoginToken = function (userId, stampedToken) {
  Meteor.users.update(
    userId,
    {$push: {'services.resume.loginTokens': stampedToken}}
  );
};

Tinytest.addAsync('accounts - login token', function (test, onComplete) {
  // Test that we can login when the database contains a leftover
  // old style unhashed login token.
  var userId1 = Accounts.insertUserDoc({}, {username: Random.id()});
  var stampedToken = Accounts._generateStampedLoginToken();
  insertUnhashedLoginToken(userId1, stampedToken);
  var connection = DDP.connect(Meteor.absoluteUrl());
  connection.call('login', {resume: stampedToken.token});
  connection.disconnect();

  // Steal the unhashed token from the database and use it to login.
  // This is a sanity check so that when we *can't* login with a
  // stolen *hashed* token, we know it's not a problem with the test.
  var userId2 = Accounts.insertUserDoc({}, {username: Random.id()});
  insertUnhashedLoginToken(userId2, Accounts._generateStampedLoginToken());
  var stolenToken = Meteor.users.findOne(userId2).services.resume.loginTokens[0].token;
  test.isTrue(stolenToken);
  connection = DDP.connect(Meteor.absoluteUrl());
  connection.call('login', {resume: stolenToken});
  connection.disconnect();

  // Now do the same thing, this time with a stolen hashed token.
  var userId3 = Accounts.insertUserDoc({}, {username: Random.id()});
  Accounts._insertLoginToken(userId3, Accounts._generateStampedLoginToken());
  stolenToken = Meteor.users.findOne(userId3).services.resume.loginTokens[0].hashedToken;
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
  var userId4 = Accounts.insertUserDoc({}, {username: Random.id()});
  var stampedToken = Accounts._generateStampedLoginToken();
  insertUnhashedLoginToken(userId4, stampedToken);
  connection = DDP.connect(Meteor.absoluteUrl());
  connection.call('login', {resume: stampedToken.token});
  connection.disconnect();

  // The token is no longer available to be stolen.
  stolenToken = Meteor.users.findOne(userId4).services.resume.loginTokens[0].token;
  test.isFalse(stolenToken);

  // After the upgrade, the client can still login with their original
  // unhashed login token.
  connection = DDP.connect(Meteor.absoluteUrl());
  connection.call('login', {resume: stampedToken.token});
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

Tinytest.add(
  'accounts - get new token',
  function (test) {
    // Test that the `getNewToken` method returns us a valid token, with
    // the same expiration as our original token.
    var userId = Accounts.insertUserDoc({}, { username: Random.id() });
    var stampedToken = Accounts._generateStampedLoginToken();
    Accounts._insertLoginToken(userId, stampedToken);
    var conn = DDP.connect(Meteor.absoluteUrl());
    conn.call('login', { resume: stampedToken.token });
    test.equal(conn.call('getCurrentLoginToken'),
               Accounts._hashLoginToken(stampedToken.token));

    var newTokenResult = conn.call('getNewToken');
    test.equal(newTokenResult.tokenExpires,
               Accounts._tokenExpiration(stampedToken.when));
    test.equal(conn.call('getCurrentLoginToken'),
               Accounts._hashLoginToken(newTokenResult.token));
    conn.disconnect();

    // A second connection should be able to log in with the new token
    // we got.
    var secondConn = DDP.connect(Meteor.absoluteUrl());
    secondConn.call('login', { resume: newTokenResult.token });
    secondConn.disconnect();
  }
);

Tinytest.addAsync(
  'accounts - remove other tokens',
  function (test, onComplete) {
    // Test that the `removeOtherTokens` method removes all tokens other
    // than the caller's token, thereby logging out and closing other
    // connections.
    var userId = Accounts.insertUserDoc({}, { username: Random.id() });
    var stampedTokens = [];
    var conns = [];

    _.times(2, function (i) {
      stampedTokens.push(Accounts._generateStampedLoginToken());
      Accounts._insertLoginToken(userId, stampedTokens[i]);
      var conn = DDP.connect(Meteor.absoluteUrl());
      conn.call('login', { resume: stampedTokens[i].token });
      test.equal(conn.call('getCurrentLoginToken'),
                 Accounts._hashLoginToken(stampedTokens[i].token));
      conns.push(conn);
    });

    conns[0].call('removeOtherTokens');
    simplePoll(
      function () {
        var tokens = _.map(conns, function (conn) {
          return conn.call('getCurrentLoginToken');
        });
        return ! tokens[1] &&
          tokens[0] === Accounts._hashLoginToken(stampedTokens[0].token);
      },
      function () { // success
        _.each(conns, function (conn) {
          conn.disconnect();
        });
        onComplete();
      },
      function () { // timed out
        throw new Error("accounts - remove other tokens timed out");
      }
    );
  }
);

Tinytest.add(
  'accounts - hook callbacks can access Meteor.userId()',
  function (test) {
    var userId = Accounts.insertUserDoc({}, { username: Random.id() });
    var stampedToken = Accounts._generateStampedLoginToken();
    Accounts._insertLoginToken(userId, stampedToken);

    var validateStopper = Accounts.validateLoginAttempt(function(attempt) {
      test.equal(Meteor.userId(), validateAttemptExpectedUserId, "validateLoginAttempt");
      return true;
    });
    var onLoginStopper = Accounts.onLogin(function(attempt) {
      test.equal(Meteor.userId(), onLoginExpectedUserId, "onLogin");
    });
    var onLogoutStopper = Accounts.onLogout(function(logoutContext) {
      test.equal(logoutContext.user._id, onLogoutExpectedUserId, "onLogout");
      test.instanceOf(logoutContext.connection, Object);
    });
    var onLoginFailureStopper = Accounts.onLoginFailure(function(attempt) {
      test.equal(Meteor.userId(), onLoginFailureExpectedUserId, "onLoginFailure");
    });

    var conn = DDP.connect(Meteor.absoluteUrl());

    // On a new connection, Meteor.userId() should be null until logged in.
    var validateAttemptExpectedUserId = null;
    var onLoginExpectedUserId = userId;
    conn.call('login', { resume: stampedToken.token });

    // Now that the user is logged in on the connection, Meteor.userId() should
    // return that user.
    validateAttemptExpectedUserId = userId;
    conn.call('login', { resume: stampedToken.token });

    // Trigger onLoginFailure callbacks
    var onLoginFailureExpectedUserId = userId;
    test.throws(function() { conn.call('login', { resume: "bogus" }) }, '403');

    // Trigger onLogout callbacks
    var onLogoutExpectedUserId = userId;
    conn.call('logout');

    conn.disconnect();
    validateStopper.stop();
    onLoginStopper.stop();
    onLogoutStopper.stop();
    onLoginFailureStopper.stop();
  }
);

Tinytest.add(
  'accounts - verify onExternalLogin hook can update oauth user profiles',
  function (test) {
    // Verify user profile data is saved properly when not using the
    // onExternalLogin hook.
    let facebookId = Random.id();
    const uid1 = Accounts.updateOrCreateUserFromExternalService(
      'facebook',
      { id: facebookId },
      { profile: { foo: 1 } },
    ).id;
    let users =
      Meteor.users.find({ 'services.facebook.id': facebookId }).fetch();
    test.length(users, 1);
    test.equal(users[0].profile.foo, 1);

    // Verify user profile data can be modified using the onExternalLogin
    // hook, for existing users.
    Accounts.onExternalLogin((options) => {
      options.profile.foo = 2;
      return options;
    });
    Accounts.updateOrCreateUserFromExternalService(
      'facebook',
      { id: facebookId },
      { profile: { foo: 1 } },
    );
    users = Meteor.users.find({ 'services.facebook.id': facebookId }).fetch();
    test.length(users, 1);
    test.equal(users[0].profile.foo, 2);

    // Verify user profile data can be modified using the onExternalLogin
    // hook, for new users.
    facebookId = Random.id();
    const uid2 = Accounts.updateOrCreateUserFromExternalService(
      'facebook',
      { id: facebookId },
      { profile: { foo: 3 } },
    ).id;
    users = Meteor.users.find({ 'services.facebook.id': facebookId }).fetch();
    test.length(users, 1);
    test.equal(users[0].profile.foo, 2);

    // Cleanup
    Meteor.users.remove(uid1);
    Meteor.users.remove(uid2);
    Accounts._onExternalLoginHook = null;
  }
);
