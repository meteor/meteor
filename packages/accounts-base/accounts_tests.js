import { Mongo } from 'meteor/mongo';
import { URL } from 'meteor/url';
import { Meteor } from 'meteor/meteor';
import {
  Accounts,
  AccountsServer,
  resolveCaseInsensitiveCollation,
  createCaseInsensitiveIndexes,
  generateCasePermutationsForString,
} from 'meteor/accounts-base';
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
    Accounts._additionalFindUserOnExternalLogin = null;
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

  //
  // Case-insensitive username / email lookups.
  //
  // Two strategies exist: the legacy regex strategy (default) and the opt-in
  // MongoDB collation strategy (`caseInsensitiveCollation` setting). The
  // parity suite below runs every behavioural scenario under both strategies
  // so that enabling collation never changes what a login or a duplicate
  // check does, only how MongoDB executes it.
  //

  const CASE_INSENSITIVE_STRATEGIES = ['regex', 'collation'];

  // Runs `fn` with Accounts temporarily switched to the given strategy.
  // Collation queries do not require the `*_ci` indexes to be correct, only
  // to be fast, so toggling the in-memory setting is enough for these tests.
  const withCaseInsensitiveStrategy = async (strategy, fn) => {
    const original = Accounts._caseInsensitiveCollation;
    Accounts._caseInsensitiveCollation =
      strategy === 'collation' ? resolveCaseInsensitiveCollation(true) : null;
    try {
      await fn();
    } finally {
      Accounts._caseInsensitiveCollation = original;
    }
  };

  const addCaseInsensitiveParityTest = (name, fn) => {
    for (const strategy of CASE_INSENSITIVE_STRATEGIES) {
      Tinytest.addAsync(
        `accounts - case-insensitive lookup (${strategy}) - ${name}`,
        async test => {
          const created = [];
          const createUser = async options => {
            const userId = await Accounts.createUser(options);
            created.push(userId);
            return userId;
          };
          try {
            await withCaseInsensitiveStrategy(strategy, () =>
              fn(test, { createUser, strategy })
            );
          } finally {
            for (const userId of created) {
              await Meteor.users.removeAsync(userId);
            }
          }
        }
      );
    }
  };

  const findIdByUsername = async username => {
    const user = await Accounts.findUserByUsername(username, { fields: { _id: 1 } });
    return user ? user._id : null;
  };

  const findIdByEmail = async email => {
    const user = await Accounts.findUserByEmail(email, { fields: { _id: 1 } });
    return user ? user._id : null;
  };

  addCaseInsensitiveParityTest(
    'finds a user by username or email regardless of case',
    async (test, { createUser }) => {
      const suffix = Random.id(10);
      const username = `AdaLovelace${suffix}`;
      const email = `Ada-Intercept@Lovelace.com${suffix}`;
      const userId = await createUser({ username, email });

      // Exact case
      test.equal(await findIdByUsername(username), userId, 'username exact');
      test.equal(await findIdByEmail(email), userId, 'email exact');
      // Lower case
      test.equal(await findIdByUsername(username.toLowerCase()), userId, 'username lower');
      test.equal(await findIdByEmail(email.toLowerCase()), userId, 'email lower');
      // Upper case
      test.equal(await findIdByUsername(username.toUpperCase()), userId, 'username upper');
      test.equal(await findIdByEmail(email.toUpperCase()), userId, 'email upper');
      // Mixed case that differs from the stored value in the first 4 chars
      // (the regex strategy only permutes that prefix)
      test.equal(await findIdByUsername(`aDaLovelace${suffix}`), userId, 'username mixed');
      test.equal(await findIdByEmail(`aDa-intercept@lovelace.com${suffix}`), userId, 'email mixed');
    }
  );

  addCaseInsensitiveParityTest(
    'ignores case of non-ASCII letters',
    async (test, { createUser }) => {
      const suffix = Random.id(10);
      const username = `ÁdaLØvela😈e${suffix}`;
      const email = `ÁDA-Intercept@lövelace.com${suffix}`;
      const userId = await createUser({ username, email });

      test.equal(await findIdByUsername(`ádaløvela😈e${suffix}`), userId, 'username');
      test.equal(await findIdByUsername(`ÁDALØVELA😈E${suffix}`), userId, 'username upper');
      test.equal(await findIdByEmail(`áda-intercept@LÖVELACE.com${suffix}`), userId, 'email');
    }
  );

  addCaseInsensitiveParityTest(
    'does not treat accented and unaccented letters as equal',
    async (test, { createUser }) => {
      const suffix = Random.id(10);
      const userId = await createUser({
        username: `Ada${suffix}`,
        email: `ada@example.com${suffix}`,
      });

      test.equal(await findIdByUsername(`ada${suffix}`), userId, 'plain lower');
      test.isNull(await findIdByUsername(`Áda${suffix}`), 'accented username');
      test.isNull(await findIdByEmail(`ádá@example.com${suffix}`), 'accented email');
    }
  );

  addCaseInsensitiveParityTest(
    'requires a match of the full string',
    async (test, { createUser }) => {
      const suffix = Random.id(10);
      const userId = await createUser({
        username: `AdaLovelace${suffix}`,
        email: `ada-intercept@lovelace.com${suffix}`,
      });

      test.equal(await findIdByUsername(`adalovelace${suffix}`), userId, 'sanity');
      test.isNull(await findIdByUsername(`lovelace${suffix}`), 'username suffix');
      test.isNull(await findIdByUsername(`AdaLovelace`), 'username prefix');
      test.isNull(await findIdByUsername(`AdaLovelace${suffix}x`), 'username longer');
      test.isNull(await findIdByEmail(`com${suffix}`), 'email suffix');
      test.isNull(await findIdByEmail(`ada-intercept@lovelace.com`), 'email prefix');
    }
  );

  addCaseInsensitiveParityTest(
    'treats regex metacharacters literally',
    async (test, { createUser }) => {
      const suffix = Random.id(10);
      const userId = await createUser({
        username: `Ada.Love+lace(1)${suffix}`,
        email: `ada.love+lace@example.com${suffix}`,
      });

      // Metacharacters in the query must not act as a pattern
      test.isNull(await findIdByUsername(`.+${suffix}`), 'username pattern');
      test.isNull(await findIdByUsername(`Ada.Love.lace(1)${suffix}`), 'dot wildcard');
      test.isNull(await findIdByUsername(`AdaxLove+lace(1)${suffix}`), 'stored dot');
      test.isNull(await findIdByEmail(`.+${suffix}`), 'email pattern');
      test.isNull(await findIdByEmail(`ada.love\\+lace@example.com${suffix}`), 'escaped plus');
      // ...but must still match literally, in any case
      test.equal(await findIdByUsername(`ADA.LOVE+LACE(1)${suffix}`), userId, 'username literal');
      test.equal(await findIdByEmail(`ADA.Love+Lace@Example.com${suffix}`), userId, 'email literal');
    }
  );

  addCaseInsensitiveParityTest(
    'handles short values and non-letter prefixes',
    async (test, { createUser }) => {
      // The regex strategy permutes the case of the first 4 characters; make
      // sure values shorter than that, and values whose prefix contains
      // digits or symbols, behave the same under both strategies.
      const short = `Q${Random.id(2)}`;
      await Meteor.users.removeAsync({ username: new RegExp(`^${Meteor._escapeRegExp(short)}$`, 'i') });
      const shortId = await createUser({ username: short });
      test.equal(await findIdByUsername(short.toLowerCase()), shortId, 'short lower');
      test.equal(await findIdByUsername(short.toUpperCase()), shortId, 'short upper');

      const suffix = Random.id(10);
      const numericId = await createUser({
        username: `12-_Ada${suffix}`,
        email: `1.2@3-4.com${suffix}`,
      });
      test.equal(await findIdByUsername(`12-_ADA${suffix}`), numericId, 'digit prefix');
      test.equal(await findIdByEmail(`1.2@3-4.COM${suffix}`), numericId, 'digit email');
      test.isNull(await findIdByUsername(`13-_ada${suffix}`), 'different digit');
    }
  );

  addCaseInsensitiveParityTest(
    'returns no match when several users differ only by case',
    async (test, { createUser }) => {
      const suffix = Random.id(10);
      const username = `AdaLovelace${suffix}`;
      const otherUsername = `adaLOVELACE${suffix}`;
      const email = `Ada-Intercept@lovelace.com${suffix}`;
      const otherEmail = `ada-intercept@LOVELACE.com${suffix}`;

      const userId = await createUser({ username, email });
      Accounts._skipCaseInsensitiveChecksForTest[otherUsername] = true;
      Accounts._skipCaseInsensitiveChecksForTest[otherEmail] = true;
      let otherId;
      try {
        otherId = await createUser({ username: otherUsername, email: otherEmail });
      } finally {
        delete Accounts._skipCaseInsensitiveChecksForTest[otherUsername];
        delete Accounts._skipCaseInsensitiveChecksForTest[otherEmail];
      }

      // Ambiguous case-insensitive lookups find nobody
      test.isNull(await findIdByUsername(`ADALOVELACE${suffix}`), 'ambiguous username');
      test.isNull(await findIdByEmail(`ADA-INTERCEPT@LOVELACE.COM${suffix}`), 'ambiguous email');
      // Exact-case lookups still resolve each user
      test.equal(await findIdByUsername(username), userId, 'exact first');
      test.equal(await findIdByUsername(otherUsername), otherId, 'exact second');
      test.equal(await findIdByEmail(email), userId, 'exact first email');
      test.equal(await findIdByEmail(otherEmail), otherId, 'exact second email');
    }
  );

  addCaseInsensitiveParityTest(
    'rejects duplicates that differ only by case',
    async (test, { createUser }) => {
      const suffix = Random.id(10);
      const username = `AdaLovelace${suffix}`;
      const email = `Ada-Intercept@lovelace.com${suffix}`;
      const userId = await createUser({ username, email });

      // Direct checks
      await test.throwsAsync(
        () => Accounts._checkForCaseInsensitiveDuplicates('username', 'Username', `adalovelace${suffix}`),
        /Username already exists/
      );
      await test.throwsAsync(
        () => Accounts._checkForCaseInsensitiveDuplicates('emails.address', 'Email', `ADA-INTERCEPT@LOVELACE.COM${suffix}`),
        /Email already exists/
      );
      // The user's own value is not a duplicate of itself
      await Accounts._checkForCaseInsensitiveDuplicates('username', 'Username', `adalovelace${suffix}`, userId);
      await Accounts._checkForCaseInsensitiveDuplicates('emails.address', 'Email', `ada-intercept@lovelace.com${suffix}`, userId);
      // Unrelated values pass
      await Accounts._checkForCaseInsensitiveDuplicates('username', 'Username', `someoneelse${suffix}`);
      await Accounts._checkForCaseInsensitiveDuplicates('emails.address', 'Email', `someone@else.com${suffix}`);

      // Through createUser
      await test.throwsAsync(
        () => Accounts.createUser({ username: `ADALOVELACE${suffix}` }),
        /Username already exists/
      );
      await test.throwsAsync(
        () => Accounts.createUser({ email: `ada-intercept@LOVELACE.com${suffix}` }),
        /Email already exists/
      );
      test.equal(
        await Meteor.users.find({ username: `ADALOVELACE${suffix}` }).countAsync(),
        0,
        'duplicate not inserted'
      );
    }
  );

  Tinytest.addAsync(
    'accounts - case-insensitive lookup - regex strategy is the default',
    async test => {
      // The test app runs without settings, so the legacy strategy applies.
      test.isNull(Accounts._caseInsensitiveCollation);
      test.isNull(resolveCaseInsensitiveCollation(undefined));
      test.isNull(resolveCaseInsensitiveCollation(null));
      test.isNull(resolveCaseInsensitiveCollation(false));
    }
  );

  Tinytest.addAsync(
    'accounts - case-insensitive lookup - regex strategy uses prefix permutations',
    async test => {
      test.equal(generateCasePermutationsForString('ab'), ['ab', 'aB', 'Ab', 'AB']);
      test.equal(generateCasePermutationsForString('a1'), ['a1', 'A1']);
      test.equal(generateCasePermutationsForString(''), ['']);

      const selector = Accounts._selectorForFastCaseInsensitiveLookup('username', 'Ada.L');
      test.equal(selector.$and.length, 2);
      // 4 letters -> 2^3 permutations (the dot has no case)
      test.equal(selector.$and[0].$or.length, 8);
      const anchored = selector.$and[1].username;
      test.instanceOf(anchored, RegExp);
      test.equal(anchored.flags, 'i');
      test.isTrue(anchored.test('ADA.L'));
      test.isFalse(anchored.test('ADAxL'));
      test.isFalse(anchored.test('ADA.Lx'));
    }
  );

  Tinytest.addAsync(
    'accounts - case-insensitive collation - true enables the default collation',
    async test => {
      test.equal(resolveCaseInsensitiveCollation(true), { locale: 'en', strength: 2 });
    }
  );

  Tinytest.addAsync(
    'accounts - case-insensitive collation - objects are merged over the default',
    async test => {
      test.equal(
        resolveCaseInsensitiveCollation({ locale: 'de' }),
        { locale: 'de', strength: 2 }
      );
      test.equal(
        resolveCaseInsensitiveCollation({ strength: 1, numericOrdering: true }),
        { locale: 'en', strength: 1, numericOrdering: true }
      );
      test.equal(resolveCaseInsensitiveCollation({}), { locale: 'en', strength: 2 });
    }
  );

  Tinytest.addAsync(
    'accounts - case-insensitive collation - AccountsServer fails fast on invalid option',
    async test => {
      // Thrown before super(), so no duplicate 'users' collection or methods
      // are registered.
      test.throws(
        () => new AccountsServer(Meteor.server, { caseInsensitiveCollation: 'en' }),
        /must be a boolean or a plain MongoDB collation object/
      );
    }
  );

  Tinytest.addAsync(
    'accounts - case-insensitive collation - cannot be set through Accounts.config',
    async test => {
      test.throws(
        () => Accounts.config({ caseInsensitiveCollation: true }),
        /cannot be set through Accounts.config\(\)/
      );
      test.isNull(Accounts._caseInsensitiveCollation);
      test.isFalse('caseInsensitiveCollation' in Accounts._options);
    }
  );

  Tinytest.addAsync(
    'accounts - case-insensitive collation - rejects invalid options',
    async test => {
      const cases = [
        ['en', /must be a boolean or a plain MongoDB collation object/],
        [42, /must be a boolean or a plain MongoDB collation object/],
        [[], /must be a boolean or a plain MongoDB collation object/],
        [{ locale: 'en', bogus: true }, /Invalid caseInsensitiveCollation key\(s\): bogus/],
        [{ foo: 1, bar: 2 }, /Invalid caseInsensitiveCollation key\(s\): foo, bar/],
        [{ locale: 123 }, /locale must be a string/],
        [{ strength: 0 }, /strength must be an integer 1-5/],
        [{ strength: 6 }, /strength must be an integer 1-5/],
        [{ strength: 2.5 }, /strength must be an integer 1-5/],
        [{ strength: '2' }, /strength must be an integer 1-5/],
        [{ caseLevel: 'yes' }, /caseLevel must be a boolean/],
        [{ numericOrdering: 1 }, /numericOrdering must be a boolean/],
        [{ backwards: 'no' }, /backwards must be a boolean/],
        [{ normalization: 0 }, /normalization must be a boolean/],
        [{ caseFirst: 'first' }, /caseFirst must be "upper", "lower", or "off"/],
        [{ alternate: 'ignore' }, /alternate must be "non-ignorable" or "shifted"/],
        [{ maxVariable: 'all' }, /maxVariable must be "punct" or "space"/],
      ];
      for (const [value, expected] of cases) {
        test.throws(() => resolveCaseInsensitiveCollation(value), expected);
      }
    }
  );

  //
  // Index management
  //

  const withTemporaryCollection = async fn => {
    const collection = new Mongo.Collection(`ci_index_test_${Random.id()}`);
    try {
      await fn(collection);
    } finally {
      try {
        await collection.rawCollection().drop();
      } catch (error) {
        // The collection may never have been created
      }
    }
  };

  const findIndex = async (collection, name) => {
    const indexes = await collection.rawCollection().indexes();
    return indexes.find(index => index.name === name);
  };

  Tinytest.addAsync(
    'accounts - case-insensitive collation - creates collation indexes',
    async test => {
      await withTemporaryCollection(async collection => {
        const collation = { locale: 'de', strength: 2 };
        await createCaseInsensitiveIndexes(collection, collation);

        const usernameIndex = await findIndex(collection, 'username_ci');
        test.isTrue(usernameIndex, 'username_ci exists');
        test.equal(usernameIndex.key, { username: 1 });
        test.isTrue(usernameIndex.sparse, 'username_ci sparse');
        test.isFalse(usernameIndex.unique, 'username_ci not unique');
        test.equal(usernameIndex.collation.locale, 'de');
        test.equal(usernameIndex.collation.strength, 2);

        const emailIndex = await findIndex(collection, 'emails.address_ci');
        test.isTrue(emailIndex, 'emails.address_ci exists');
        test.equal(emailIndex.key, { 'emails.address': 1 });
        test.isTrue(emailIndex.sparse, 'emails.address_ci sparse');
        test.equal(emailIndex.collation.locale, 'de');
        test.equal(emailIndex.collation.strength, 2);

        // Creating them again is a no-op (restart safety)
        await createCaseInsensitiveIndexes(collection, collation);
        const indexes = await collection.rawCollection().indexes();
        test.equal(indexes.filter(index => index.name.endsWith('_ci')).length, 2);
      });
    }
  );

  Tinytest.addAsync(
    'accounts - case-insensitive collation - explains index name conflicts',
    async test => {
      await withTemporaryCollection(async collection => {
        // An app already owns the "username_ci" name with different options
        await collection.createIndexAsync('username', { name: 'username_ci' });
        await test.throwsAsync(
          () => createCaseInsensitiveIndexes(collection, { locale: 'en', strength: 2 }),
          /could not create the "username_ci" collation index/
        );
      });
    }
  );

  Tinytest.addAsync(
    'accounts - case-insensitive collation - init only creates indexes when enabled',
    async test => {
      const originalCollection = Accounts.users;
      const originalCollation = Accounts._caseInsensitiveCollation;
      try {
        // Disabled (default): only the regular indexes are created
        await withTemporaryCollection(async collection => {
          Accounts.config({ collection });
          Accounts._caseInsensitiveCollation = null;
          await Accounts.init();
          test.isTrue(await findIndex(collection, 'username_1'), 'regular username index');
          test.isFalse(await findIndex(collection, 'username_ci'), 'no username_ci');
          test.isFalse(await findIndex(collection, 'emails.address_ci'), 'no emails.address_ci');
        });

        // Enabled: the collation indexes are added next to the regular ones
        await withTemporaryCollection(async collection => {
          Accounts.config({ collection });
          Accounts._caseInsensitiveCollation = resolveCaseInsensitiveCollation(true);
          await Accounts.init();
          test.isTrue(await findIndex(collection, 'username_1'), 'regular username index');
          const usernameIndex = await findIndex(collection, 'username_ci');
          test.isTrue(usernameIndex, 'username_ci');
          test.equal(usernameIndex.collation.locale, 'en');
          test.isTrue(await findIndex(collection, 'emails.address_ci'), 'emails.address_ci');
        });
      } finally {
        Accounts._caseInsensitiveCollation = originalCollation;
        Accounts.config({ collection: originalCollection });
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
