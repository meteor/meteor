import { Mongo } from 'meteor/mongo';
import { URL } from 'meteor/url';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';

Meteor.methods({
  getCurrentLoginToken: async function () {
    return Accounts._getLoginToken(this.connection.id);
  }
});

Tinytest.addAsync('accounts - config - token lifetime', async test => {
  const { loginExpirationInDays } = Accounts._options;
  Accounts._options.loginExpirationInDays = 2;
  test.equal(Accounts._getTokenLifetimeMs(), 2 * 24 * 60 * 60 * 1000);
  Accounts._options.loginExpirationInDays = loginExpirationInDays;
});

Tinytest.addAsync('accounts - config - unexpiring tokens', async test => {
  const { loginExpirationInDays } = Accounts._options;

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

Tinytest.addAsync('accounts - config - default token lifetime', async test => {
  const options = Accounts._options;
  Accounts._options = {};
  test.equal(
    Accounts._getTokenLifetimeMs(),
    Accounts.DEFAULT_LOGIN_EXPIRATION_DAYS * 24 * 60 * 60 * 1000,
  );
  Accounts._options = options;
});

Tinytest.addAsync('accounts - config - defaultFieldSelector', async test => {
  const options = Accounts._options;
  Accounts._options = {};
  const setValue = { bigArray: 0 };
  Accounts.config({ defaultFieldSelector: setValue });
  test.equal(Accounts._options.defaultFieldSelector, setValue);
  Accounts._options = options;
});

const idsInValidateNewUser = {};
Accounts.validateNewUser(user => {
  idsInValidateNewUser[user._id] = true;
  return true;
});

Tinytest.addAsync('accounts - validateNewUser gets passed user with _id', async test => {
  const { userId } = await Accounts.updateOrCreateUserFromExternalService('foobook', { id: Random.id() });
  test.isTrue(userId in idsInValidateNewUser);
});

Tinytest.addAsync('accounts - insertUserDoc username', async test => {
  const userIn = {
    username: Random.id()
  };

  // user does not already exist. create a user object with fields set.
  const userId = await Accounts.insertUserDoc(
    { profile: { name: 'Foo Bar' } },
    userIn
  );
  const userOut = await Meteor.users.findOneAsync(userId);
  test.equal(typeof userOut.createdAt, 'object');
  test.equal(userOut.profile.name, 'Foo Bar');
  test.equal(userOut.username, userIn.username);

  // run the hook again. now the user exists, so it throws an error.
  await test.throwsAsync(
    async () => await Accounts.insertUserDoc({ profile: { name: 'Foo Bar' } }, userIn),
    'Username already exists.'
  );

  // cleanup
  await Meteor.users.removeAsync(userId);
});

Tinytest.addAsync('accounts - insertUserDoc email', async test => {
  const email1 = Random.id();
  const email2 = Random.id();
  const email3 = Random.id();
  const userIn = {
    emails: [{ address: email1, verified: false },
      { address: email2, verified: true }]
  };

  // user does not already exist. create a user object with fields set.
  const userId = await Accounts.insertUserDoc(
    { profile: { name: 'Foo Bar' } },
    userIn
  );
  const userOut = await Meteor.users.findOneAsync(userId);

  test.equal(typeof userOut.createdAt, 'object');
  test.equal(userOut.profile.name, 'Foo Bar');
  test.equal(userOut.emails, userIn.emails);

  // run the hook again with the exact same emails.
  // run the hook again. now the user exists, so it throws an error.
  await test.throwsAsync(
    async () => await Accounts.insertUserDoc({ profile: { name: 'Foo Bar' } }, userIn),
    'Email already exists.'
  );

  // now with only one of them.
  await test.throwsAsync(
    async () =>
      await Accounts.insertUserDoc({}, { emails: [{ address: email1 }] }),
    'Email already exists.'
  );

  await test.throwsAsync(
    async () =>
      await Accounts.insertUserDoc({}, { emails: [{ address: email2 }] }),
    'Email already exists.'
  );


  // a third email works.
  const userId3 = await Accounts.insertUserDoc(
    {}, { emails: [{ address: email3 }] }
  );
  const user3 = await Meteor.users.findOneAsync(userId3);
  test.equal(typeof user3.createdAt, 'object');

  // cleanup
  await Meteor.users.removeAsync(userId);
  await Meteor.users.removeAsync(userId3);
});

// More token expiration tests are in accounts-password
Tinytest.addAsync('accounts - expire numeric token', async (test, onComplete) => {
  const userIn = { username: Random.id() };
  const userId = await Accounts.insertUserDoc({
    profile: {
      name: 'Foo Bar'
    }
  }, userIn);
  const date = new Date(new Date() - 5000);
  await Meteor.users.updateAsync(userId, {
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
  const observe = await Meteor.users.find(userId).observe({
    changed: newUser => {
      if (newUser.services && newUser.services.resume &&
        (!newUser.services.resume.loginTokens ||
          newUser.services.resume.loginTokens.length === 0)) {
        observe.stop();
        onComplete();
      }
    }
  });
  await Accounts._expireTokens(new Date(), userId);
});


// Login tokens used to be stored unhashed in the database.  We want
// to make sure users can still login after upgrading.
const insertUnhashedLoginToken = async (userId, stampedToken) => {
  await Meteor.users.updateAsync(
    userId,
    { $push: { 'services.resume.loginTokens': stampedToken } }
  );
};

Tinytest.addAsync('accounts - login token', async (test) => {
  // Test that we can login when the database contains a leftover
  // old style unhashed login token.
  const userId1 =
    await Accounts.insertUserDoc({}, { username: Random.id() });
  const stampedToken1 = Accounts._generateStampedLoginToken();
  await insertUnhashedLoginToken(userId1, stampedToken1);
  let connection = DDP.connect(Meteor.absoluteUrl());
  await connection.callAsync('login', { resume: stampedToken1.token });
  connection.disconnect();

  // Steal the unhashed token from the database and use it to login.
  // This is a sanity check so that when we *can't* login with a
  // stolen *hashed* token, we know it's not a problem with the test.
  const userId2 =
    await Accounts.insertUserDoc({}, { username: Random.id() });
  await insertUnhashedLoginToken(userId2, Accounts._generateStampedLoginToken());
  const user2 = await Meteor.users.findOneAsync(userId2);
  const stolenToken1 = user2.services.resume.loginTokens[0].token;
  test.isTrue(stolenToken1);
  connection = DDP.connect(Meteor.absoluteUrl());
  await connection.callAsync('login', { resume: stolenToken1 });
  connection.disconnect();

  // Now do the same thing, this time with a stolen hashed token.
  const userId3 =
    await Accounts.insertUserDoc({}, { username: Random.id() });
  await Accounts._insertLoginToken(userId3, Accounts._generateStampedLoginToken());
  const user3 = await Meteor.users.findOneAsync(userId3);
  const stolenToken2 = user3.services.resume.loginTokens[0].hashedToken;
  test.isTrue(stolenToken2);
  connection = DDP.connect(Meteor.absoluteUrl());
  // evil plan foiled
  await test.throwsAsync(
    async () => await connection.callAsync('login', { resume: stolenToken2 }),
    /You\'ve been logged out by the server/
  );
  connection.disconnect();

  // Old style unhashed tokens are replaced by hashed tokens when
  // encountered.  This means that after someone logins once, the
  // old unhashed token is no longer available to be stolen.
  const userId4 =
    await Accounts.insertUserDoc({}, { username: Random.id() });
  const stampedToken2 = Accounts._generateStampedLoginToken();
  await insertUnhashedLoginToken(userId4, stampedToken2);
  connection = DDP.connect(Meteor.absoluteUrl());
  await connection.callAsync('login', { resume: stampedToken2.token });
  connection.disconnect();

  // The token is no longer available to be stolen.
  const user4 = await Meteor.users.findOneAsync(userId4);
  const stolenToken3 = user4.services.resume.loginTokens[0].token;
  test.isFalse(stolenToken3);

  // After the upgrade, the client can still login with their original
  // unhashed login token.
  connection = DDP.connect(Meteor.absoluteUrl());
  await connection.callAsync('login', { resume: stampedToken2.token });
  connection.disconnect();

});

Tinytest.addAsync(
  'accounts - connection data cleaned up',
  (test, onComplete) => {
    makeTestConnection(
      test,
      (clientConn, serverConn) => {
        // onClose callbacks are called in order, so we run after the
        // close callback in accounts.
        serverConn.onClose(() => {
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

Tinytest.addAsync('accounts - get new token', async test => {
    // Test that the `getNewToken` method returns us a valid token, with
    // the same expiration as our original token.
    const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
    const stampedToken = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stampedToken);

    const conn = DDP.connect(Meteor.absoluteUrl());
    await conn.callAsync('login', { resume: stampedToken.token });
    test.equal(await conn.callAsync('getCurrentLoginToken'),
      Accounts._hashLoginToken(stampedToken.token));

    const newTokenResult = await conn.callAsync('getNewToken');
    test.equal(newTokenResult.tokenExpires,
      Accounts._tokenExpiration(stampedToken.when));
    const token = await conn.callAsync('getCurrentLoginToken');
    test.equal(await conn.callAsync('getCurrentLoginToken'),
      Accounts._hashLoginToken(newTokenResult.token));
    conn.disconnect();

    // A second connection should be able to log in with the new token
    // we got.
    const secondConn = DDP.connect(Meteor.absoluteUrl());
    await secondConn.callAsync('login', { resume: newTokenResult.token });
    secondConn.disconnect();
  }
);

Tinytest.addAsync('accounts - remove other tokens', async (test) => {
    // Test that the `removeOtherTokens` method removes all tokens other
    // than the caller's token, thereby logging out and closing other
    // connections.
    const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
    const stampedTokens = [];
    const conns = [];

    for (let i = 0; i < 2; i++) {
      stampedTokens.push(Accounts._generateStampedLoginToken());
      await Accounts._insertLoginToken(userId, stampedTokens[i]);
      const conn = DDP.connect(Meteor.absoluteUrl());
      await conn.callAsync('login', { resume: stampedTokens[i].token });
      test.equal(await conn.callAsync('getCurrentLoginToken'),
        Accounts._hashLoginToken(stampedTokens[i].token));
      conns.push(conn);
    }
    ;

    await conns[0].callAsync('removeOtherTokens');
    simplePoll(async () => {
        let tokens = [];
        for (const conn of conns) {
          tokens.push(await conn.callAsync('getCurrentLoginToken'));
        }
        return !tokens[1] &&
          tokens[0] === Accounts._hashLoginToken(stampedTokens[0].token);
      },
      () => { // success
        conns.forEach(conn => conn.disconnect());
      },
      () => { // timed out
        throw new Error("accounts - remove other tokens timed out");
      }
    );
  }
);

Tinytest.addAsync(
  'accounts - hook callbacks can access Meteor.userId()',
  async test => {
    const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
    const stampedToken = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stampedToken);

    const validateStopper = Accounts.validateLoginAttempt(attempt => {
      test.equal(Meteor.userId(), validateAttemptExpectedUserId, "validateLoginAttempt");
      return true;
    });
    const onLoginStopper = Accounts.onLogin(attempt =>
      test.equal(Meteor.userId(), onLoginExpectedUserId, "onLogin")
    );
    const onLogoutStopper = Accounts.onLogout(logoutContext => {
      test.equal(logoutContext.user._id, onLogoutExpectedUserId, "onLogout");
      test.instanceOf(logoutContext.connection, Object);
    });
    const onLoginFailureStopper = Accounts.onLoginFailure(attempt =>
      test.equal(Meteor.userId(), onLoginFailureExpectedUserId, "onLoginFailure")
    );

    const conn = DDP.connect(Meteor.absoluteUrl());

    // On a new connection, Meteor.userId() should be null until logged in.
    let validateAttemptExpectedUserId = null;
    const onLoginExpectedUserId = userId;
    await conn.callAsync('login', { resume: stampedToken.token });

    // Now that the user is logged in on the connection, Meteor.userId() should
    // return that user.
    validateAttemptExpectedUserId = userId;
    await conn.callAsync('login', { resume: stampedToken.token });

    // Trigger onLoginFailure callbacks
    const onLoginFailureExpectedUserId = userId;
    await test.throwsAsync(
      async () =>
        await conn.callAsync('login', { resume: "bogus" }), '403');

    // Trigger onLogout callbacks
    const onLogoutExpectedUserId = userId;
    await conn.callAsync('logout');

    conn.disconnect();
    validateStopper.stop();
    onLoginStopper.stop();
    onLogoutStopper.stop();
    onLoginFailureStopper.stop();
  }
);

Tinytest.addAsync(
  'accounts - hook callbacks obey options.defaultFieldSelector',
  async test => {
    const ignoreFieldName = "bigArray";
    const userId =
      await Accounts.insertUserDoc({}, { username: Random.id(), [ignoreFieldName]: [1] });
    const stampedToken = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stampedToken);
    const options = Accounts._options;
    Accounts._options = {};
    Accounts.config({ defaultFieldSelector: { [ignoreFieldName]: 0 } });
    test.equal(Accounts._options.defaultFieldSelector, { [ignoreFieldName]: 0 }, 'defaultFieldSelector');

    const validateStopper = Accounts.validateLoginAttempt(attempt => {
      test.isUndefined(allowLogin != 'bogus' ? attempt.user[ignoreFieldName] : attempt.user, "validateLoginAttempt")
      return allowLogin;
    });
    const onLoginStopper = Accounts.onLogin(attempt =>
      test.isUndefined(attempt.user[ignoreFieldName], "onLogin")
    );
    const onLogoutStopper = Accounts.onLogout(logoutContext =>
      test.isUndefined(logoutContext.user[ignoreFieldName], "onLogout")
    );
    const onLoginFailureStopper = Accounts.onLoginFailure(attempt =>
      test.isUndefined(allowLogin != 'bogus' ? attempt.user[ignoreFieldName] : attempt.user, "onLoginFailure")
    );

    const conn = DDP.connect(Meteor.absoluteUrl());

    // test a new connection
    let allowLogin = true;
    await conn.callAsync('login', { resume: stampedToken.token });

    // Now that the user is logged in on the connection, Meteor.userId() should
    // return that user.
    await conn.callAsync('login', { resume: stampedToken.token });

    // Trigger onLoginFailure callbacks, this will not include the user object
    allowLogin = 'bogus';
    await test.throwsAsync(
      async () =>
        await conn.callAsync('login', { resume: "bogus" }), '403');

    // test a forced login fail which WILL include the user object
    allowLogin = false;
    await test.throwsAsync(
      async () =>
        await conn.callAsync('login', { resume: stampedToken.token }), '403');

    // Trigger onLogout callbacks
    const onLogoutExpectedUserId = userId;
    await conn.callAsync('logout');

    Accounts._options = options;
    conn.disconnect();
    validateStopper.stop();
    onLoginStopper.stop();
    onLogoutStopper.stop();
    onLoginFailureStopper.stop();
  }
);

Tinytest.addAsync(
  'accounts - Meteor.user() obeys options.defaultFieldSelector',
  async test => {
    const ignoreFieldName = "bigArray";
    const customField = "customField";
    const userId =
      await Accounts.insertUserDoc({}, { username: Random.id(), [ignoreFieldName]: [1], [customField]: 'test' });
    const stampedToken = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stampedToken);
    const options = Accounts._options;

    // stub Meteor.userId() so it works outside methods and returns the correct user:
    const origAccountsUserId = Accounts.userId;
    Accounts.userId =
      () => userId;

    Accounts._options = {};

    // test the field is included by default
    let user = await Meteor.userAsync();
    test.isNotUndefined(user[ignoreFieldName], 'included by default');

    // test the field is excluded
    Accounts.config({ defaultFieldSelector: { [ignoreFieldName]: 0 } });
    user = await Meteor.userAsync();
    test.isUndefined(user[ignoreFieldName], 'excluded');
    user = await Meteor.userAsync({});
    test.isUndefined(user[ignoreFieldName], 'excluded {}');

    // test the field can still be retrieved if required
    user = await Meteor.userAsync({ fields: { [ignoreFieldName]: 1 } });
    test.isNotUndefined(user[ignoreFieldName], 'field can be retrieved');
    test.isUndefined(user.username, 'field can be retrieved username');

    // test a combined negative field specifier
    user = await Meteor.userAsync({ fields: { username: 0 } });
    test.isUndefined(user[ignoreFieldName], 'combined field selector');
    test.isUndefined(user.username, 'combined field selector username');

    // test an explicit request for the full user object
    user = await Meteor.userAsync({ fields: {} });
    test.isNotUndefined(user[ignoreFieldName], 'full selector');
    test.isNotUndefined(user.username, 'full selector username');

    Accounts._options = {};

    // Test that a custom field gets retrieved properly
    Accounts.config({ defaultFieldSelector: { [customField]: 1 } });
    user = await Meteor.userAsync()
    test.isNotUndefined(user[customField]);
    test.isUndefined(user.username);
    test.isUndefined(user[ignoreFieldName]);

    Accounts._options = options;
    Accounts.userId = origAccountsUserId;
  }
);


Tinytest.addAsync(
  'accounts async - Meteor.userAsync() obeys options.defaultFieldSelector',
  async test => {
    const ignoreFieldName = "bigArray";
    const customField = "customField";
    const userId =
      await Accounts.insertUserDoc({}, { username: Random.id(), [ignoreFieldName]: [1], [customField]: 'test' });
    const stampedToken = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stampedToken);
    const options = Accounts._options;

    // stub Meteor.userId() so it works outside methods and returns the correct user:
    const origAccountsUserId = Accounts.userId;
    Accounts.userId =
      () => userId;

    Accounts._options = {};

    // test the field is included by default
    let user = await Meteor.userAsync();
    test.isNotUndefined(user[ignoreFieldName], 'included by default');

    // test the field is excluded
    Accounts.config({ defaultFieldSelector: { [ignoreFieldName]: 0 } });
    user = await Meteor.userAsync();
    test.isUndefined(user[ignoreFieldName], 'excluded');
    user = await Meteor.userAsync({});
    test.isUndefined(user[ignoreFieldName], 'excluded {}');

    // test the field can still be retrieved if required
    user = await Meteor.userAsync({ fields: { [ignoreFieldName]: 1 } });
    test.isNotUndefined(user[ignoreFieldName], 'field can be retrieved');
    test.isUndefined(user.username, 'field can be retrieved username');

    // test a combined negative field specifier
    user = await Meteor.userAsync({ fields: { username: 0 } });
    test.isUndefined(user[ignoreFieldName], 'combined field selector');
    test.isUndefined(user.username, 'combined field selector username');

    // test an explicit request for the full user object
    user = await Meteor.userAsync({ fields: {} });
    test.isNotUndefined(user[ignoreFieldName], 'full selector');
    test.isNotUndefined(user.username, 'full selector username');

    Accounts._options = {};

    // Test that a custom field gets retrieved properly
    Accounts.config({ defaultFieldSelector: { [customField]: 1 } });
    user = await Meteor.userAsync();
    test.isNotUndefined(user[customField]);
    test.isUndefined(user.username);
    test.isUndefined(user[ignoreFieldName]);

    Accounts._options = options;
    Accounts.userId = origAccountsUserId;
  }
);
Tinytest.addAsync(
  'accounts - verify onExternalLogin hook can update oauth user profiles',
  async test => {
    // Verify user profile data is saved properly when not using the
    // onExternalLogin hook.
    let facebookId = Random.id();
    const u1 = await Accounts.updateOrCreateUserFromExternalService(
      'facebook',
      { id: facebookId },
      { profile: { foo: 1 } },
    );
    const ignoreFieldName = "bigArray";

    const c =
      await Meteor.users.updateAsync(u1.userId, { $set: { [ignoreFieldName]: [1] } });

    let users =
      await Meteor.users.find({ 'services.facebook.id': facebookId }).fetch();

    test.length(users, 1);
    test.equal(users[0].profile.foo, 1);
    test.isNotUndefined(users[0][ignoreFieldName], 'ignoreField - before limit fields');

    // Verify user profile data can be modified using the onExternalLogin
    // hook, for existing users.
    // Also verify that the user object is filtered by _options.defaultFieldSelector
    const accountsOptions = Accounts._options;
    Accounts._options = {};
    Accounts.config({ defaultFieldSelector: { [ignoreFieldName]: 0 } });
    Accounts.onExternalLogin((options, user) => {
      options.profile.foo = 2;
      test.isUndefined(users[ignoreFieldName], 'ignoreField - after limit fields');
      return options;
    });
    await Accounts.updateOrCreateUserFromExternalService(
      'facebook',
      { id: facebookId },
      { profile: { foo: 1 } },
    );
    // test.isUndefined(users[0][ignoreFieldName], 'ignoreField - fields limited');
    users = await Meteor.users.find({ 'services.facebook.id': facebookId }).fetch();
    test.length(users, 1);
    test.equal(users[0].profile.foo, 2);
    test.isNotUndefined(users[0][ignoreFieldName], 'ignoreField - still there');

    // Verify user profile data can be modified using the onExternalLogin
    // hook, for new users.
    facebookId = Random.id();
    const u2 = await Accounts.updateOrCreateUserFromExternalService(
      'facebook',
      { id: facebookId },
      { profile: { foo: 3 } },
    );
    users = await Meteor.users.find({ 'services.facebook.id': facebookId }).fetch();
    test.length(users, 1);
    test.equal(users[0].profile.foo, 2);

    // Cleanup
    await Meteor.users.removeAsync(u1);
    await Meteor.users.removeAsync(u2.userId);
    Accounts._onExternalLoginHook = null;
    Accounts._options = accountsOptions;
  }
);

Tinytest.addAsync(
  'accounts - verify beforeExternalLogin hook can stop user login',
  async test => {
    // Verify user data is saved properly when not using the
    // beforeExternalLogin hook.
    let facebookId = Random.id();

    const u =
      await Accounts.updateOrCreateUserFromExternalService(
        'facebook',
        { id: facebookId },
        { profile: { foo: 1 } },
      );

    const ignoreFieldName = "bigArray";

    const c =
      await Meteor.users.updateAsync(u.userId, { $set: { [ignoreFieldName]: [1] } });

    let users =
      await Meteor.users.find({ 'services.facebook.id': facebookId }).fetch();

    test.length(users, 1);
    test.equal(users[0].profile.foo, 1);
    test.isNotUndefined(users[0][ignoreFieldName], 'ignoreField - before limit fields');

    // Verify that when beforeExternalLogin returns false
    // that an error throws and user is not saved
    Accounts.beforeExternalLogin((serviceName, serviceData, user) => {
      // Check that we get the correct data
      test.equal(serviceName, 'facebook');
      test.equal(serviceData, { id: facebookId });
      test.equal(user._id, u.userId);
      return false
    });

    await test.throwsAsync(
      async () =>
        await Accounts.updateOrCreateUserFromExternalService(
          'facebook',
          { id: facebookId },
          { profile: { foo: 1 } },
        ));

    // Cleanup
    await Meteor.users.removeAsync(u.userId);
    Accounts._beforeExternalLoginHook = null;
  }
);

Tinytest.addAsync(
  'accounts - verify setAdditionalFindUserOnExternalLogin hook can provide user',
  async test => {
    // create test user, without a google service
    const testEmail = "test@testdomain.com"
    // being sure that the user is not already in the database
    await Meteor.users.removeAsync({ "emails.address": testEmail });
    const uid0 = await Accounts.createUser({ email: testEmail })

    // Verify that user is found from email and service merged
    Accounts.setAdditionalFindUserOnExternalLogin(async ({ serviceName, serviceData }) => {
      if (serviceName === "google") {
        return await Accounts.findUserByEmail(serviceData.email)
      }
    })

    let googleId = Random.id();
    const u1 = await Accounts.updateOrCreateUserFromExternalService(
      'google',
      { id: googleId, email: testEmail },
      { profile: { foo: 1 } },
    );
    test.equal(uid0, u1.userId)

    // Cleanup
    if (u1.userId !== uid0) {
      await Meteor.users.removeAsync(uid0)
    }
    await Meteor.users.removeAsync(u1.userId);
    Accounts.selectCustomUserOnExternalLogin = null;
  }
);

if (Meteor.isServer) {
  Tinytest.addAsync('accounts - config - collection - mongo.collection', async test => {
    const origCollection = Accounts.users;
    // create same user in two different collections - should pass
    const email = "test-collection@testdomain.com"

    const collection0 = new Mongo.Collection(`test1_${Random.id()}`);

    Accounts.config({
      collection: collection0,
    })
    const uid0 = await Accounts.createUser({email})
    await Meteor.users.removeAsync(uid0);

    const collection1 = new Mongo.Collection(`test2_${Random.id()}`);
    Accounts.config({
      collection: collection1,
    })
    const uid1 = await Accounts.createUser({email})

    await Meteor.users.removeAsync(uid1);
    test.notEqual(uid0, uid1);

    Accounts.config({
      collection: origCollection,
    });
  });
  Tinytest.addAsync('accounts - config - collection - name', async test => {
    const origCollection = Accounts.users;
    // create same user in two different collections - should pass
    const email = "test-collection@testdomain.com"

    Accounts.config({
       collection: `collection0_${Random.id()}`,
    })
    const uid0 = await Accounts.createUser({email})
    await Meteor.users.removeAsync(uid0);

    Accounts.config({
       collection: `collection1_${Random.id()}`,
    })
    const uid1 = await Accounts.createUser({email})
    await Meteor.users.removeAsync(uid1);

    test.notEqual(uid0, uid1);

    Accounts.config({
      collection: origCollection,
    });
  });

  Tinytest.addAsync(
    'accounts - urls work with sync resolution',
    async test => {
      // No extra params
      const verifyEmailURL = new URL(Accounts.urls.verifyEmail('test'));
      test.equal(verifyEmailURL.searchParams.toString(), "");

      // Extra params
      const extraParams = { test: 'success' };
      const resetPasswordURL = new URL(Accounts.urls.resetPassword('test', extraParams));
      test.equal(resetPasswordURL.searchParams.get('test'), extraParams.test);
      const enrollAccountURL = new URL(Accounts.urls.enrollAccount('test', extraParams));
      test.equal(enrollAccountURL.searchParams.get('test'), extraParams.test);
    }
  );

  Tinytest.addAsync(
    'accounts - urls work with async resolution',
    async test => {
      // Save original urls
      const originalUrls = Accounts.urls;
      try {
        // Override urls methods to return Promises
        Accounts.urls = {
          resetPassword: (token, extraParams) =>
            new Promise(resolve => resolve(originalUrls.resetPassword(token, extraParams))),
          verifyEmail: (token, extraParams) =>
            new Promise(resolve => resolve(originalUrls.verifyEmail(token, extraParams))),
          loginToken: (selector, token, extraParams) =>
            new Promise(resolve => resolve(originalUrls.loginToken(selector, token, extraParams))),
          enrollAccount: (token, extraParams) =>
            new Promise(resolve => resolve(originalUrls.enrollAccount(token, extraParams))),
        };

        // Test with no extra params
        const verifyEmailUrl = await Accounts.urls.verifyEmail('test');
        const verifyEmailURL = new URL(verifyEmailUrl);
        test.equal(verifyEmailURL.searchParams.toString(), "");

        // Test with extra params
        const extraParams = { test: 'async-success' };
        const resetPasswordUrl = await Accounts.urls.resetPassword('test', extraParams);
        const resetPasswordURL = new URL(resetPasswordUrl);
        test.equal(resetPasswordURL.searchParams.get('test'), extraParams.test);

        const enrollAccountUrl = await Accounts.urls.enrollAccount('test', extraParams);
        const enrollAccountURL = new URL(enrollAccountUrl);
        test.equal(enrollAccountURL.searchParams.get('test'), extraParams.test);

        const loginTokenUrl = await Accounts.urls.loginToken('email', 'token', extraParams);
        const loginTokenURL = new URL(loginTokenUrl);
        test.equal(loginTokenURL.searchParams.get('test'), extraParams.test);
      } finally {
        // Restore original urls
        Accounts.urls = originalUrls;
      }
    }
  );
}

Tinytest.addAsync('accounts - updateOrCreateUserFromExternalService - Facebook', async test => {
  const facebookId = Random.id();

  // create an account with facebook
  const u1 =
    await Accounts.updateOrCreateUserFromExternalService(
      'facebook', { id: facebookId, monkey: 42 }, { profile: { foo: 1 } });
  const users1 =
    await Meteor.users.find({ "services.facebook.id": facebookId }).fetch();
  test.length(users1, 1);
  test.equal(users1[0].profile.foo, 1);
  test.equal(users1[0].services.facebook.monkey, 42);

  // create again with the same id, see that we get the same user.
  // it should update services.facebook but not profile.
  const u2 =
    await Accounts.updateOrCreateUserFromExternalService(
      'facebook', { id: facebookId, llama: 50 },
      { profile: { foo: 1000, bar: 2 } });
  test.equal(u1.id, u2.id);
  const users2 =
    await Meteor.users.find({ "services.facebook.id": facebookId }).fetch();
  test.length(users2, 1);
  test.equal(users2[0].profile.foo, 1);
  test.equal(users2[0].profile.bar, undefined);
  test.equal(users2[0].services.facebook.llama, 50);
  // make sure we *don't* lose values not passed this call to
  // updateOrCreateUserFromExternalService
  test.equal(users2[0].services.facebook.monkey, 42);

  // cleanup
  await Meteor.users.removeAsync(u1.id);
});

Tinytest.addAsync('accounts - updateOrCreateUserFromExternalService - Meteor Developer', async test => {
  const developerId =
    Random.id();
  const u1 =
    await Accounts.updateOrCreateUserFromExternalService(
      'meteor-developer',
      { id: developerId, username: 'meteor-developer' },
      { profile: { name: 'meteor-developer' } }
    );
  const users1 =
    await Meteor.users.find({ 'services.meteor-developer.id': developerId }).fetch();
  test.length(users1, 1);
  test.equal(users1[0].profile.name, 'meteor-developer');

  const u2 =
    await Accounts.updateOrCreateUserFromExternalService(
      'meteor-developer',
      { id: developerId, username: 'meteor-developer' },
      { profile: { name: 'meteor-developer', username: 'developer' } }
    );
  test.equal(u1.id, u2.id);
  const users2 =
    await Meteor.users.find({ 'services.meteor-developer.id': developerId }).fetch();
  test.length(users2, 1);
  test.equal(users1[0].profile.name, 'meteor-developer');
  test.equal(users1[0].profile.username, undefined);

  // cleanup
  await Meteor.users.removeAsync(u1);
});

Tinytest.addAsync('accounts - updateOrCreateUserFromExternalService - Weibo', async test => {
  const weiboId1 =
    Random.id();
  const weiboId2 =
    Random.id();

  // users that have different service ids get different users
  const u1 =
    await Accounts.updateOrCreateUserFromExternalService(
      'weibo', { id: weiboId1 }, { profile: { foo: 1 } });
  const u2 =
    await Accounts.updateOrCreateUserFromExternalService(
      'weibo', { id: weiboId2 }, { profile: { bar: 2 } });
  test.equal(await Meteor.users.find({ "services.weibo.id": { $in: [weiboId1, weiboId2] } }).countAsync(), 2);

  const user1 =
    await Meteor.users.findOneAsync({ "services.weibo.id": weiboId1 });
  const user2 =
    await Meteor.users.findOneAsync({ "services.weibo.id": weiboId2 });
  test.equal(user1.profile.foo, 1);
  test.equal(user1.emails, undefined);
  test.equal(user2.profile.bar, 2);
  test.equal(user2.emails, undefined);

  // cleanup
  Meteor.users.removeAsync(u1.id);
  Meteor.users.removeAsync(u2.id);
});

Tinytest.addAsync('accounts - updateOrCreateUserFromExternalService - Twitter', async test => {
  const twitterIdOld = parseInt(Random.hexString(4), 16);
  const twitterIdNew = '' + twitterIdOld;

  // create an account with twitter using the old ID format of integer
  const u1 =
    await Accounts.updateOrCreateUserFromExternalService(
      'twitter', { id: twitterIdOld, monkey: 42 }, { profile: { foo: 1 } });
  const users1 =
    await Meteor.users.find({ "services.twitter.id": twitterIdOld }).fetch();
  test.length(users1, 1);
  test.equal(users1[0].profile.foo, 1);
  test.equal(users1[0].services.twitter.monkey, 42);

  // Update the account with the new ID format of string
  // test that the existing user is found, and that the ID
  // gets updated to a string value
  const u2 =
    await Accounts.updateOrCreateUserFromExternalService(
      'twitter', { id: twitterIdNew, monkey: 42 }, { profile: { foo: 1 } });
  test.equal(u1.id, u2.id);
  const users2 =
    await Meteor.users.find({ "services.twitter.id": twitterIdNew }).fetch();
  test.length(users2, 1);

  // cleanup
  await Meteor.users.removeAsync(u1.id);
});

Tinytest.addAsync(
  'accounts - login observer behavior depends on tokenTrackingStrategy',
  async (test) => {
    const { Facts } = Package['facts-base'];
    const getObserveHandles = () =>
      Facts._factsByPackage?.['mongo-livedata']?.['observe-handles'] || 0;

    const baseline = getObserveHandles();

    // Create a test user with a login token.
    const username = Random.id();
    const userId = await Accounts.insertUserDoc({}, { username });
    const stampedToken = Accounts._generateStampedLoginToken();
    await Accounts._insertLoginToken(userId, stampedToken);

    // Open 3 connections and log each in with the same token.
    const conns = [];
    for (let i = 0; i < 3; i++) {
      const conn = DDP.connect(Meteor.absoluteUrl());
      await conn.callAsync('login', { resume: stampedToken.token });
      conns.push(conn);
    }

    if (Accounts._useInMemoryTokenTracking) {
      // In-memory mode: no new observe handles should be created.
      test.equal(
        getObserveHandles(), baseline,
        'in-memory mode should not create new observe handles'
      );
    } else {
      // Observer mode: each login creates a per-connection observe handle.
      test.isTrue(
        getObserveHandles() > baseline,
        'observer mode should create observe handles on login'
      );
    }

    // Clean up.
    conns.forEach(c => c.disconnect());
  }
);

if (Meteor.isServer) {
  // ==========================================================================
  // tokenTrackingStrategy config tests
  // ==========================================================================

  Tinytest.addAsync(
    'accounts - config - tokenTrackingStrategy is a valid config key',
    async (test) => {
      const origOptions = Accounts._options;
      Accounts._options = {};
      try {
        Accounts.config({ tokenTrackingStrategy: 'observer' });
        test.equal(
          Accounts._options.tokenTrackingStrategy, 'observer',
          'tokenTrackingStrategy should be stored in _options'
        );
      } finally {
        Accounts._options = origOptions;
      }
    }
  );

  Tinytest.addAsync(
    'accounts - tokenTrackingStrategy defaults to observer mode',
    async (test) => {
      test.isFalse(
        Accounts._useInMemoryTokenTracking,
        'default should be observer mode (_useInMemoryTokenTracking === false)'
      );
    }
  );

  // tokenTrackingStrategy is resolved once in the AccountsServer constructor.
  // Calling Accounts.config() afterwards may store the new value in _options
  // but must not flip the effective mode. The config override also warns via
  // Meteor._debug when the requested mode differs from the effective one.
  Tinytest.addAsync(
    'accounts - tokenTrackingStrategy is startup-only (config() does not switch modes)',
    async (test) => {
      const origOptions = Accounts._options;
      const origDebug = Meteor._debug;
      Accounts._options = {};
      let warned = null;
      Meteor._debug = (msg) => { warned = String(msg); };
      try {
        Accounts.config({ tokenTrackingStrategy: 'in-memory' });
        test.isFalse(
          Accounts._useInMemoryTokenTracking,
          'effective mode must remain observer despite in-memory config call'
        );
        test.isTrue(
          warned && warned.includes('tokenTrackingStrategy'),
          'config() should warn via Meteor._debug on a mismatched strategy'
        );
      } finally {
        Meteor._debug = origDebug;
        Accounts._options = origOptions;
      }
    }
  );

  // ==========================================================================
  // In-memory helper unit tests (mock connections, no mode swap needed)
  //
  // The helpers (_closeConnectionsForToken, _closeAllConnectionsForUser, etc.)
  // are unconditionally defined on the prototype and operate directly on
  // _tokenConnections + _accountData. We test them with mock connection objects
  // whose close() just records the call.
  // ==========================================================================

  Tinytest.addAsync(
    'accounts - in-memory helpers: _closeConnectionsForToken',
    async (test) => {
      const origTokenConns = Accounts._tokenConnections;
      Accounts._tokenConnections = new Map();

      const userId = 'mock-user-' + Random.id();
      const hashedToken = 'mock-token-' + Random.id();
      const otherToken = 'mock-other-' + Random.id();
      const connId1 = 'mock-conn-' + Random.id();
      const connId2 = 'mock-conn-' + Random.id();
      const connId3 = 'mock-conn-' + Random.id();
      let closed1 = false, closed2 = false, closed3 = false;

      // Mock connections in _accountData
      Accounts._accountData[connId1] = {
        connection: { close() { closed1 = true; } },
      };
      Accounts._accountData[connId2] = {
        connection: { close() { closed2 = true; } },
      };
      Accounts._accountData[connId3] = {
        connection: { close() { closed3 = true; } },
      };

      // Populate _tokenConnections: two connections on hashedToken, one on otherToken
      const tokenMap = new Map();
      tokenMap.set(hashedToken, new Set([connId1, connId2]));
      tokenMap.set(otherToken, new Set([connId3]));
      Accounts._tokenConnections.set(userId, tokenMap);

      // Close connections for hashedToken only
      Accounts._closeConnectionsForToken(userId, hashedToken);

      test.isTrue(closed1, 'conn1 (same token) should be closed');
      test.isTrue(closed2, 'conn2 (same token) should be closed');
      test.isFalse(closed3, 'conn3 (different token) should NOT be closed');

      // Cleanup
      delete Accounts._accountData[connId1];
      delete Accounts._accountData[connId2];
      delete Accounts._accountData[connId3];
      Accounts._tokenConnections = origTokenConns;
    }
  );

  Tinytest.addAsync(
    'accounts - in-memory helpers: _closeAllConnectionsForUser',
    async (test) => {
      const origTokenConns = Accounts._tokenConnections;
      Accounts._tokenConnections = new Map();

      const userId = 'mock-user-' + Random.id();
      const otherUserId = 'mock-other-user-' + Random.id();
      const token1 = 'mock-token-' + Random.id();
      const token2 = 'mock-token-' + Random.id();
      const connId1 = 'mock-conn-' + Random.id();
      const connId2 = 'mock-conn-' + Random.id();
      const connId3 = 'mock-conn-' + Random.id();
      let closed1 = false, closed2 = false, closed3 = false;

      Accounts._accountData[connId1] = {
        connection: { close() { closed1 = true; } },
      };
      Accounts._accountData[connId2] = {
        connection: { close() { closed2 = true; } },
      };
      Accounts._accountData[connId3] = {
        connection: { close() { closed3 = true; } },
      };

      // userId has two tokens with one connection each
      const tokenMap1 = new Map();
      tokenMap1.set(token1, new Set([connId1]));
      tokenMap1.set(token2, new Set([connId2]));
      Accounts._tokenConnections.set(userId, tokenMap1);

      // otherUserId has one connection
      const tokenMap2 = new Map();
      tokenMap2.set(token1, new Set([connId3]));
      Accounts._tokenConnections.set(otherUserId, tokenMap2);

      Accounts._closeAllConnectionsForUser(userId);

      test.isTrue(closed1, 'conn1 (same user, token1) should be closed');
      test.isTrue(closed2, 'conn2 (same user, token2) should be closed');
      test.isFalse(closed3, 'conn3 (different user) should NOT be closed');

      delete Accounts._accountData[connId1];
      delete Accounts._accountData[connId2];
      delete Accounts._accountData[connId3];
      Accounts._tokenConnections = origTokenConns;
    }
  );

  Tinytest.addAsync(
    'accounts - in-memory helpers: _closeOtherConnectionsForUser excludes specified connection',
    async (test) => {
      const origTokenConns = Accounts._tokenConnections;
      Accounts._tokenConnections = new Map();

      const userId = 'mock-user-' + Random.id();
      const token1 = 'mock-token-' + Random.id();
      const connId1 = 'mock-conn-' + Random.id();
      const connId2 = 'mock-conn-' + Random.id();
      const connId3 = 'mock-conn-' + Random.id();
      let closed1 = false, closed2 = false, closed3 = false;

      Accounts._accountData[connId1] = {
        connection: { close() { closed1 = true; } },
      };
      Accounts._accountData[connId2] = {
        connection: { close() { closed2 = true; } },
      };
      Accounts._accountData[connId3] = {
        connection: { close() { closed3 = true; } },
      };

      const tokenMap = new Map();
      tokenMap.set(token1, new Set([connId1, connId2, connId3]));
      Accounts._tokenConnections.set(userId, tokenMap);

      // Exclude connId1 — only connId2 and connId3 should be closed
      Accounts._closeOtherConnectionsForUser(userId, connId1);

      test.isFalse(closed1, 'excluded connection should NOT be closed');
      test.isTrue(closed2, 'other connection 2 should be closed');
      test.isTrue(closed3, 'other connection 3 should be closed');

      delete Accounts._accountData[connId1];
      delete Accounts._accountData[connId2];
      delete Accounts._accountData[connId3];
      Accounts._tokenConnections = origTokenConns;
    }
  );

  Tinytest.addAsync(
    'accounts - in-memory helpers: _verifyTrackedTokens closes stale, keeps valid',
    async (test) => {
      const origTokenConns = Accounts._tokenConnections;
      Accounts._tokenConnections = new Map();

      // Create a real user with a real token in the DB.
      const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
      const stampedToken = Accounts._generateStampedLoginToken();
      await Accounts._insertLoginToken(userId, stampedToken);
      const validHashedToken = Accounts._hashLoginToken(stampedToken.token);

      const staleToken = 'stale-token-' + Random.id();
      const staleConnId = 'mock-conn-stale-' + Random.id();
      const validConnId = 'mock-conn-valid-' + Random.id();
      let staleClosed = false, validClosed = false;

      Accounts._accountData[staleConnId] = {
        connection: { close() { staleClosed = true; } },
      };
      Accounts._accountData[validConnId] = {
        connection: { close() { validClosed = true; } },
      };

      // Track both a valid token and a stale (non-existent) token.
      const tokenMap = new Map();
      tokenMap.set(staleToken, new Set([staleConnId]));
      tokenMap.set(validHashedToken, new Set([validConnId]));
      Accounts._tokenConnections.set(userId, tokenMap);

      await Accounts._verifyTrackedTokens();

      test.isTrue(staleClosed, 'connection with stale token should be closed');
      test.isFalse(validClosed, 'connection with valid token should NOT be closed');

      delete Accounts._accountData[staleConnId];
      delete Accounts._accountData[validConnId];
      Accounts._tokenConnections = origTokenConns;
      await Meteor.users.removeAsync(userId);
    }
  );

  Tinytest.addAsync(
    'accounts - in-memory helpers: _verifyTrackedTokens handles unknown userId',
    async (test) => {
      const origTokenConns = Accounts._tokenConnections;
      Accounts._tokenConnections = new Map();

      // Track a token for a userId that doesn't exist in the DB at all.
      const fakeUserId = 'nonexistent-' + Random.id();
      const fakeToken = 'fake-token-' + Random.id();
      const connId = 'mock-conn-' + Random.id();
      let closed = false;

      Accounts._accountData[connId] = {
        connection: { close() { closed = true; } },
      };

      const tokenMap = new Map();
      tokenMap.set(fakeToken, new Set([connId]));
      Accounts._tokenConnections.set(fakeUserId, tokenMap);

      await Accounts._verifyTrackedTokens();

      test.isTrue(closed, 'connection for non-existent user should be closed');

      delete Accounts._accountData[connId];
      Accounts._tokenConnections = origTokenConns;
    }
  );

  // ==========================================================================
  // In-memory integration tests (temporarily swap mode, real DDP connections)
  //
  // These tests switch the global Accounts instance to in-memory mode,
  // perform real DDP logins, and verify the _tokenConnections map state.
  // State is saved/restored in a try/finally block.
  //
  // Why not use Accounts.config({ tokenTrackingStrategy: 'in-memory' })?
  // The strategy is resolved at AccountsServer construction (see
  // accounts_server.js constructor: `_useInMemoryTokenTracking =
  // options.tokenTrackingStrategy === 'in-memory'`). Calling config() at
  // runtime does not rebuild the observer/in-memory bookkeeping, and
  // instantiating a fresh AccountsServer for a test would re-register
  // methods/publications on Meteor.server and trigger a DB scan. Tests
  // therefore mutate the resolved flag and backing structures directly.
  // ==========================================================================

  // Helper to save and swap to in-memory mode, returning a restore function.
  // Direct internal-state mutation is intentional here — see the comment above.
  function switchToInMemoryMode() {
    const saved = {
      flag: Accounts._useInMemoryTokenTracking,
      tokenConns: Accounts._tokenConnections,
      observes: Accounts._userObservesForConnections,
      observeNum: Accounts._nextUserObserveNumber,
    };
    Accounts._useInMemoryTokenTracking = true;
    Accounts._tokenConnections = new Map();
    delete Accounts._userObservesForConnections;
    delete Accounts._nextUserObserveNumber;
    return function restore() {
      Accounts._useInMemoryTokenTracking = saved.flag;
      Accounts._tokenConnections = saved.tokenConns;
      if (saved.observes !== undefined) {
        Accounts._userObservesForConnections = saved.observes;
      }
      if (saved.observeNum !== undefined) {
        Accounts._nextUserObserveNumber = saved.observeNum;
      }
    };
  }

  Tinytest.addAsync(
    'accounts - in-memory mode: _tokenConnections populated on login and cleaned on logout',
    async (test) => {
      const restore = switchToInMemoryMode();
      try {
        const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
        const stampedToken = Accounts._generateStampedLoginToken();
        await Accounts._insertLoginToken(userId, stampedToken);
        const hashedToken = Accounts._hashLoginToken(stampedToken.token);

        // Login via DDP
        const conn = DDP.connect(Meteor.absoluteUrl());
        await conn.callAsync('login', { resume: stampedToken.token });

        // Verify _tokenConnections is populated
        const tokenMap = Accounts._tokenConnections.get(userId);
        test.isTrue(tokenMap, '_tokenConnections should have entry for userId');
        test.isTrue(
          tokenMap && tokenMap.has(hashedToken),
          '_tokenConnections should track the hashed token'
        );
        const connIds = tokenMap && tokenMap.get(hashedToken);
        test.isTrue(
          connIds && connIds.size > 0,
          'token should have at least one tracked connection'
        );

        // Logout should clear the tracking for this connection
        await conn.callAsync('logout');

        const tokenMapAfter = Accounts._tokenConnections.get(userId);
        if (tokenMapAfter) {
          const connIdsAfter = tokenMapAfter.get(hashedToken);
          test.isTrue(
            !connIdsAfter || connIdsAfter.size === 0,
            'connection should be removed from tracking after logout'
          );
        }

        conn.disconnect();
        await Meteor.users.removeAsync(userId);
      } finally {
        restore();
      }
    }
  );

  Tinytest.addAsync(
    'accounts - in-memory mode: destroyToken closes connections before DB update',
    async (test) => {
      const restore = switchToInMemoryMode();
      try {
        const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
        const stampedToken1 = Accounts._generateStampedLoginToken();
        const stampedToken2 = Accounts._generateStampedLoginToken();
        await Accounts._insertLoginToken(userId, stampedToken1);
        await Accounts._insertLoginToken(userId, stampedToken2);
        const hashedToken1 = Accounts._hashLoginToken(stampedToken1.token);
        const hashedToken2 = Accounts._hashLoginToken(stampedToken2.token);

        // Login with each token on separate connections
        const conn1 = DDP.connect(Meteor.absoluteUrl());
        await conn1.callAsync('login', { resume: stampedToken1.token });
        const conn2 = DDP.connect(Meteor.absoluteUrl());
        await conn2.callAsync('login', { resume: stampedToken2.token });

        // Both should be tracked
        test.isTrue(
          Accounts._tokenConnections.has(userId),
          'user should be tracked'
        );

        // Destroy token1 — should close conn1
        await Accounts.destroyToken(userId, hashedToken1);

        // token1 should no longer have tracked connections
        const tokenMap = Accounts._tokenConnections.get(userId);
        if (tokenMap) {
          const connIds = tokenMap.get(hashedToken1);
          test.isTrue(
            !connIds || connIds.size === 0,
            'destroyed token should have no tracked connections'
          );
        }

        // token2 should still be tracked
        test.isTrue(
          tokenMap && tokenMap.has(hashedToken2),
          'other token should still be tracked'
        );

        conn1.disconnect();
        conn2.disconnect();
        await Meteor.users.removeAsync(userId);
      } finally {
        restore();
      }
    }
  );

  Tinytest.addAsync(
    'accounts - in-memory mode: logoutAllClients closes all connections',
    async (test) => {
      const restore = switchToInMemoryMode();
      try {
        const userId = await Accounts.insertUserDoc({}, { username: Random.id() });
        const stampedToken1 = Accounts._generateStampedLoginToken();
        const stampedToken2 = Accounts._generateStampedLoginToken();
        await Accounts._insertLoginToken(userId, stampedToken1);
        await Accounts._insertLoginToken(userId, stampedToken2);

        const conn1 = DDP.connect(Meteor.absoluteUrl());
        await conn1.callAsync('login', { resume: stampedToken1.token });
        const conn2 = DDP.connect(Meteor.absoluteUrl());
        await conn2.callAsync('login', { resume: stampedToken2.token });

        // Both should be tracked
        const mapBefore = Accounts._tokenConnections.get(userId);
        test.isTrue(mapBefore && mapBefore.size >= 2, 'both tokens should be tracked');

        // logoutAllClients from conn1 — should close conn2 and clear all tokens
        await conn1.callAsync('logoutAllClients');

        // After logoutAllClients, all tokens for this user should be cleared
        const mapAfter = Accounts._tokenConnections.get(userId);
        if (mapAfter) {
          let totalConns = 0;
          for (const connIds of mapAfter.values()) {
            totalConns += connIds.size;
          }
          test.equal(totalConns, 0, 'no connections should remain tracked');
        }

        conn1.disconnect();
        conn2.disconnect();
        await Meteor.users.removeAsync(userId);
      } finally {
        restore();
      }
    }
  );
}
