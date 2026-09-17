import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { Random } from 'meteor/random';
import { createTestAuthenticator } from './webauthn_test_helpers.js';
import { getWebAuthnConfig } from './server/config.js';
import {
  WebAuthnChallenges,
  consumeChallenge,
  getDecoySecret,
} from './server/collection.js';
import { decoyCredentials, isDecoyCredentialId } from './server/decoys.js';
import {
  addCredentialToUser,
  detectCounterRollback,
  hasAlternativeLoginMethod,
  touchCredential,
} from './server/credential_store.js';

// Login handlers are exercised over a real DDP connection so the whole login
// pipeline, its hooks and the second-factor gate run. The default rate limit
// would trip on the number of logins these tests perform, and the exact error
// reasons are asserted, so ambiguous messages are turned off.
Accounts.removeDefaultRateLimit();
Accounts._options.ambiguousErrorMessages = false;

const TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

/**
 * A fake authenticator bound to the configured relying party.
 * @param {Object} [options] Extra `createTestAuthenticator` options, such as a `credentialId` to claim.
 * @returns {Promise<Object>}
 */
const newAuthenticator = (options = {}) => {
  const config = getWebAuthnConfig();
  return createTestAuthenticator({ rpID: config.rpID, origin: config.origins[0], ...options });
};

/**
 * Runs `fn` with a fresh DDP connection to the test server, then disconnects.
 * @param {Object} test
 * @param {Function} fn
 * @returns {Promise<void>}
 */
async function withConnection(test, fn) {
  const conn = await createTestConnectionPromise(test);
  try {
    await fn(conn);
  } finally {
    conn.disconnect();
  }
}

/**
 * Calls a method over a connection.
 * @param {Object} conn
 * @param {String} name
 * @param {...*} args
 * @returns {Promise<*>}
 */
const call = (conn, name, ...args) => conn.callAsync(name, ...args);

/**
 * Asserts that a promise rejects with the given error code.
 * @param {Object} test
 * @param {Promise} promise
 * @param {String|Number} code The expected `error` field.
 * @param {String} [message] The assertion message.
 * @returns {Promise<Error|undefined>} The error, when it was thrown.
 */
async function expectError(test, promise, code, message) {
  try {
    await promise;
    test.fail({ message: `expected error ${code}${message ? `: ${message}` : ''}` });
  } catch (error) {
    test.equal(error.error, code, message || `error code ${code}`);
    return error;
  }
  return undefined;
}

/**
 * Creates a user with a random username and password.
 * @param {Object} [extra] Extra `createUser` options.
 * @returns {Promise<Object>} `{ userId, username, password }`.
 */
async function createPasswordUser(extra = {}) {
  const username = `webauthn_${Random.id()}`;
  const password = Random.secret();
  const userId = await Accounts.createUserAsync({ username, password, ...extra });
  return { userId, username, password };
}

/**
 * Logs in with a password over a connection, with extra login options such as
 * a second-factor answer.
 * @param {Object} conn
 * @param {String} username
 * @param {String} password
 * @param {Object} [extra]
 * @returns {Promise<Object>} The login result.
 */
const loginWithPassword = (conn, username, password, extra = {}) =>
  call(conn, 'login', { user: { username }, password, ...extra });

/**
 * Registers a key for the logged-in user of a connection.
 * @param {Object} conn
 * @param {Object} authenticator A fake authenticator.
 * @param {String} [name] A label for the key.
 * @returns {Promise<Object>} `{ options, credential }`.
 */
async function registerCredential(conn, authenticator, name) {
  const options = await call(conn, 'generateWebAuthnRegistrationOptions', {
    mode: 'addCredential',
    ...(name ? { name } : {}),
  });
  const credential = await call(conn, 'registerWebAuthnCredential', {
    credential: authenticator.register({ challenge: options.challenge }),
    ...(name ? { name } : {}),
  });
  return { options, credential };
}

/**
 * Logs in with a key over a connection.
 * @param {Object} conn
 * @param {Object} authenticator A fake authenticator.
 * @param {Object} [options] A `selector` for identifier-first login; every other option is passed to `authenticator.assert()`.
 * @returns {Promise<Object>} The login result.
 */
async function loginWithKey(conn, authenticator, { selector, ...assertOptions } = {}) {
  const options = await call(conn, 'generateWebAuthnAuthenticationOptions', {
    mode: 'login',
    ...(selector ? { selector } : {}),
  });
  return call(conn, 'login', {
    webauthn: await authenticator.assert({ challenge: options.challenge, ...assertOptions }),
  });
}

/**
 * Loads a user document.
 * @param {String} userId
 * @returns {Promise<Object>}
 */
const getUser = userId => Meteor.users.findOneAsync(userId);

/**
 * Removes the given users and every pending challenge.
 * @param {...String} userIds
 * @returns {Promise<void>}
 */
async function cleanup(...userIds) {
  await Meteor.users.removeAsync({ _id: { $in: userIds.filter(Boolean) } });
  await WebAuthnChallenges.removeAsync({
    type: { $in: ['registration', 'authentication'] },
  });
}

/**
 * Creates a password user and runs `fn` on a connection logged in as them.
 * @param {Object} test
 * @param {Function} fn Receives `{ conn, userId, username, password }`.
 * @returns {Promise<void>}
 */
async function withLoggedInUser(test, fn) {
  const user = await createPasswordUser();
  try {
    await withConnection(test, async conn => {
      await loginWithPassword(conn, user.username, user.password);
      await fn({ conn, ...user });
    });
  } finally {
    await cleanup(user.userId);
  }
}

/**
 * As `withLoggedInUser`, with a fresh key registered for the user and the
 * connection logged out again, ready for the login under test.
 * @param {Object} test
 * @param {Function} fn Receives `{ conn, userId, username, password, key }`.
 * @param {Object} [options]
 * @param {Boolean} [options.secondFactor=false] Also require the key as a second factor.
 * @returns {Promise<void>}
 */
async function withRegisteredKey(test, fn, { secondFactor = false } = {}) {
  await withLoggedInUser(test, async context => {
    const key = await newAuthenticator();
    await registerCredential(context.conn, key);
    if (secondFactor) {
      await call(context.conn, 'enableWebAuthnSecondFactor');
    }
    await call(context.conn, 'logout');
    await fn({ ...context, key });
  });
}

Tinytest.add('accounts-webauthn - config - defaults derive from the root URL', test => {
  const rootUrl = new URL(Meteor.absoluteUrl());
  const config = getWebAuthnConfig();
  test.equal(config.rpID, rootUrl.hostname);
  test.equal(config.origins, [rootUrl.origin]);
  test.equal(typeof config.rpName, 'string');
  test.equal(config.attestationType, 'none');
  test.equal(config.residentKey, 'preferred');
  test.equal(config.userVerification, 'required');
  test.equal(config.secondFactorUserVerification, 'preferred');
  test.equal(config.timeout, 60000);
  test.isFalse(config.requireTotpOnLogin);
  test.isTrue(config.passwordlessLogin);
});

Tinytest.add('accounts-webauthn - config - overrides are applied and validated', test => {
  const previous = Accounts._options.webauthn;
  try {
    Accounts._options.webauthn = {
      rpID: 'example.com',
      rpName: 'Example',
      origins: 'https://example.com',
      userVerification: 'preferred',
      authenticatorAttachment: 'cross-platform',
      timeout: 1234,
      requireTotpOnLogin: true,
    };
    const config = getWebAuthnConfig();
    test.equal(config.rpID, 'example.com');
    test.equal(config.rpName, 'Example');
    test.equal(config.origins, ['https://example.com']);
    test.equal(config.userVerification, 'preferred');
    test.equal(config.authenticatorAttachment, 'cross-platform');
    test.equal(config.timeout, 1234);
    test.isTrue(config.requireTotpOnLogin);

    Accounts._options.webauthn = { userVerification: 'always' };
    test.throws(() => getWebAuthnConfig(), /webauthn\.userVerification/);
    Accounts._options.webauthn = { attestationType: 'indirect' };
    test.throws(() => getWebAuthnConfig(), /webauthn\.attestationType/);
    Accounts._options.webauthn = { origins: ['https://a.example', 'https://b.example'] };
    test.equal(getWebAuthnConfig().origins, ['https://a.example', 'https://b.example']);
    for (const origins of [[], [42], '', null]) {
      Accounts._options.webauthn = { origins };
      test.throws(() => getWebAuthnConfig(), /webauthn\.origins/);
    }
    Accounts._options.webauthn = { timeout: 0 };
    test.equal(getWebAuthnConfig().timeout, 60000, 'a falsy timeout keeps the default');
    for (const timeout of [-1, Infinity, '60000', 600001]) {
      Accounts._options.webauthn = { timeout };
      test.throws(() => getWebAuthnConfig(), /webauthn\.timeout/);
    }
    const twoFactor = Package['accounts-2fa'];
    delete Package['accounts-2fa'];
    try {
      Accounts._options.webauthn = { requireTotpOnLogin: true };
      test.throws(() => getWebAuthnConfig(), /accounts-2fa/);
    } finally {
      Package['accounts-2fa'] = twoFactor;
    }
  } finally {
    Accounts._options.webauthn = previous;
  }
});

Tinytest.addAsync(
  'accounts-webauthn - the decoy secret is shared through the collection and never consumed',
  async test => {
    const secret = await getDecoySecret();
    const stored = await WebAuthnChallenges.findOneAsync('decoySecret');
    test.equal(stored.secret, secret.toString('hex'), 'persisted for other processes');
    test.isUndefined(stored.expiresAt, 'not subject to the TTL index');
    test.isNull(
      await consumeChallenge('decoySecret', { type: 'authentication', mode: 'login' }),
      'a crafted challenge string cannot consume it'
    );
    test.isTrue(!!(await WebAuthnChallenges.findOneAsync('decoySecret')), 'still stored');
  }
);

Tinytest.addAsync('accounts-webauthn - decoy credential ids carry a verifiable tag', async test => {
  const decoys = await decoyCredentials({ username: `nobody_${Random.id()}` });
  for (const decoy of decoys) {
    test.isTrue(await isDecoyCredentialId(decoy.id), 'a decoy verifies');
    test.isTrue([16, 20, 32, 64].includes(Buffer.from(decoy.id, 'base64url').length));
  }
  const genuine = await newAuthenticator();
  test.isFalse(await isDecoyCredentialId(genuine.credentialId), 'a real id does not');
  test.isFalse(await isDecoyCredentialId(Buffer.from([1, 2, 3]).toString('base64url')));
});

Tinytest.add('accounts-webauthn - counter rollback detection', test => {
  test.isFalse(detectCounterRollback(0, 0), 'authenticators without a counter');
  test.isFalse(detectCounterRollback(0, 1));
  test.isFalse(detectCounterRollback(5, 6));
  test.isTrue(detectCounterRollback(5, 5));
  test.isTrue(detectCounterRollback(5, 3));
  test.isTrue(detectCounterRollback(5, 0));
});

Tinytest.addAsync(
  'accounts-webauthn - recording a use is a compare-and-set on the counter',
  async test => {
    const stored = { id: Random.id(), counter: 5 };
    const userId = await Meteor.users.insertAsync({
      services: { webauthn: { credentials: [{ ...stored }] } },
    });
    const storedCounter = async () =>
      (await getUser(userId)).services.webauthn.credentials[0].counter;
    try {
      await touchCredential(userId, stored, { newCounter: 6, credentialBackedUp: false });
      test.equal(await storedCounter(), 6);
      await expectError(
        test,
        touchCredential(userId, stored, { newCounter: 7, credentialBackedUp: false }),
        'webauthn-counter-mismatch',
        'a second assertion verified against the old counter is rejected'
      );
      test.equal(await storedCounter(), 6, 'the stored counter is left untouched');
    } finally {
      await Meteor.users.removeAsync(userId);
    }
  }
);

Tinytest.addAsync('accounts-webauthn - a credential id is stored once per user', async test => {
  const id = Random.id();
  const userId = await Meteor.users.insertAsync({
    services: { webauthn: { credentials: [{ id, counter: 0 }] } },
  });
  try {
    await expectError(
      test,
      addCredentialToUser(userId, { id, counter: 0 }),
      'webauthn-credential-in-use'
    );
    test.equal((await getUser(userId)).services.webauthn.credentials.length, 1);
    await expectError(
      test,
      addCredentialToUser(Random.id(), { id: Random.id(), counter: 0 }),
      403,
      'unknown user'
    );
  } finally {
    await Meteor.users.removeAsync(userId);
  }
});

Tinytest.add('accounts-webauthn - alternative login method detection', test => {
  test.isTrue(hasAlternativeLoginMethod({ services: { password: { bcrypt: 'x' } } }));
  test.isTrue(hasAlternativeLoginMethod({ services: { password: { argon2: 'x' } } }));
  test.isTrue(hasAlternativeLoginMethod({ services: { google: { id: '1' } } }));
  test.isFalse(
    hasAlternativeLoginMethod({
      services: { webauthn: { credentials: [] }, resume: { loginTokens: [] } },
    })
  );
  // accounts-passwordless is loaded in this test app: an email is enough.
  test.isTrue(
    hasAlternativeLoginMethod({ services: {}, emails: [{ address: 'a@b.c' }] })
  );
});

Tinytest.addAsync(
  'accounts-webauthn - register a key and log in without a username',
  async test => {
    const authenticator = await newAuthenticator();
    const loginTypes = [];
    const onLogin = Accounts.onLogin(attempt => {
      loginTypes.push(attempt.type);
    });
    try {
      await withLoggedInUser(test, async ({ conn, userId, username }) => {
        const options = await call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'addCredential',
          name: 'Key A',
        });
        const config = getWebAuthnConfig();
        test.equal(options.rp.id, config.rpID);
        test.equal(options.rp.name, config.rpName);
        test.equal(options.user.name, username);
        test.equal(options.attestation, 'none');
        test.equal(options.authenticatorSelection.residentKey, 'preferred');
        test.equal(options.authenticatorSelection.userVerification, 'required');
        test.equal(options.excludeCredentials, []);

        // The user handle is provisioned once for users created before the
        // package existed and reused afterwards.
        const { userHandle } = (await getUser(userId)).services.webauthn;
        test.isTrue(typeof userHandle === 'string' && userHandle.length > 0);
        test.equal(options.user.id, userHandle);
        const again = await call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'addCredential',
        });
        test.equal(again.user.id, userHandle);

        const stored = await call(conn, 'registerWebAuthnCredential', {
          credential: authenticator.register({ challenge: options.challenge }),
          name: 'Key A',
        });
        test.equal(stored.id, authenticator.credentialId);
        test.equal(stored.name, 'Key A');
        test.equal(stored.transports, ['usb']);
        test.isUndefined(stored.publicKey, 'the public key stays on the server');

        const user = await getUser(userId);
        const [credential] = user.services.webauthn.credentials;
        test.equal(credential.id, authenticator.credentialId);
        test.equal(credential.counter, 0);
        test.isTrue(credential.publicKey instanceof Uint8Array);
        test.equal(credential.deviceType, 'singleDevice');
        test.equal(credential.fmt, 'none');
        test.isTrue(credential.userVerified);
        test.equal(credential.lastUsedAt, null);

        await call(conn, 'logout');

        const loginOptions = await call(conn, 'generateWebAuthnAuthenticationOptions', {
          mode: 'login',
        });
        test.equal(loginOptions.rpId, config.rpID);
        test.equal(loginOptions.allowCredentials, []);
        test.equal(loginOptions.userVerification, 'required');

        const result = await call(conn, 'login', {
          webauthn: await authenticator.assert({
            challenge: loginOptions.challenge,
            userHandle,
          }),
        });
        test.equal(result.id, userId);
        test.equal(result.type, 'webauthn');
        test.isTrue(typeof result.token === 'string' && result.token.length > 0);
        test.isTrue(loginTypes.includes('webauthn'));

        const after = await getUser(userId);
        test.equal(after.services.webauthn.credentials[0].counter, 1);
        test.isTrue(after.services.webauthn.credentials[0].lastUsedAt instanceof Date);
      });
    } finally {
      onLogin.stop();
    }
  }
);

Tinytest.addAsync(
  'accounts-webauthn - identifier-first login binds the challenge to the user',
  async test => {
    const a = await createPasswordUser();
    const b = await createPasswordUser();
    const keyA = await newAuthenticator();
    const keyB = await newAuthenticator();
    try {
      await withConnection(test, async conn => {
        await loginWithPassword(conn, a.username, a.password);
        await registerCredential(conn, keyA, 'A');
        await call(conn, 'logout');
        await loginWithPassword(conn, b.username, b.password);
        await registerCredential(conn, keyB, 'B');
        await call(conn, 'logout');

        const options = await call(conn, 'generateWebAuthnAuthenticationOptions', {
          mode: 'login',
          selector: { username: a.username },
        });
        test.equal(
          options.allowCredentials.map(credential => credential.id),
          [keyA.credentialId]
        );
        test.equal(options.allowCredentials[0].transports, ['usb']);
        const result = await call(conn, 'login', {
          webauthn: await keyA.assert({ challenge: options.challenge }),
        });
        test.equal(result.id, a.userId);
        await call(conn, 'logout');

        // A challenge issued for user A cannot be answered with the key of B.
        const forA = await call(conn, 'generateWebAuthnAuthenticationOptions', {
          mode: 'login',
          selector: { username: a.username },
        });
        await expectError(
          test,
          call(conn, 'login', { webauthn: await keyB.assert({ challenge: forA.challenge }) }),
          'invalid-webauthn-assertion',
          'challenge bound to another user'
        );

        // An unknown selector gets well-formed options with a decoy credential
        // list that is stable for that selector, so the response does not
        // reveal whether the account exists.
        const nobody = { username: `nobody_${Random.id()}` };
        const unknown = await call(conn, 'generateWebAuthnAuthenticationOptions', {
          mode: 'login',
          selector: nobody,
        });
        test.isTrue([1, 2, 3].includes(unknown.allowCredentials.length));
        test.isTrue(typeof unknown.allowCredentials[0].id === 'string');
        const again = await call(conn, 'generateWebAuthnAuthenticationOptions', {
          mode: 'login',
          selector: nobody,
        });
        test.equal(again.allowCredentials, unknown.allowCredentials);
        test.isTrue(typeof unknown.challenge === 'string' && unknown.challenge.length > 0);

        // Registration refuses a decoy id exactly like a taken one, so it
        // cannot serve as an oracle telling decoys from real ids.
        await loginWithPassword(conn, a.username, a.password);
        const impostor = await newAuthenticator({ credentialId: unknown.allowCredentials[0].id });
        const registration = await call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'addCredential',
        });
        await expectError(
          test,
          call(conn, 'registerWebAuthnCredential', {
            credential: impostor.register({ challenge: registration.challenge }),
          }),
          'webauthn-credential-in-use',
          'a decoy id registers like a taken id'
        );

        // A challenge for an unknown selector is bound all the same: answering
        // it with another account's key fails exactly as it does for an
        // existing account, so the outcome does not reveal existence.
        await call(conn, 'logout');
        const forNobody = await call(conn, 'generateWebAuthnAuthenticationOptions', {
          mode: 'login',
          selector: nobody,
        });
        await expectError(
          test,
          call(conn, 'login', { webauthn: await keyA.assert({ challenge: forNobody.challenge }) }),
          'invalid-webauthn-assertion',
          'challenge bound to a selector that matched nobody'
        );
      });
    } finally {
      await cleanup(a.userId, b.userId);
    }
  }
);

Tinytest.addAsync('accounts-webauthn - a challenge is single use and expires', test =>
  withRegisteredKey(test, async ({ conn, username, key }) => {
    const options = await call(conn, 'generateWebAuthnAuthenticationOptions', {
      mode: 'login',
    });
    const assertion = await key.assert({ challenge: options.challenge });
    await call(conn, 'login', { webauthn: assertion });
    await call(conn, 'logout');
    await expectError(
      test,
      call(conn, 'login', { webauthn: assertion }),
      'webauthn-challenge-invalid',
      'replayed assertion'
    );

    const expiring = await call(conn, 'generateWebAuthnAuthenticationOptions', {
      mode: 'login',
    });
    await WebAuthnChallenges.updateAsync(expiring.challenge, {
      $set: { expiresAt: new Date(Date.now() - 1000) },
    });
    await expectError(
      test,
      call(conn, 'login', {
        webauthn: await key.assert({ challenge: expiring.challenge }),
      }),
      'webauthn-challenge-invalid',
      'expired challenge'
    );
    test.isUndefined(
      await WebAuthnChallenges.findOneAsync(expiring.challenge),
      'an expired challenge is removed when consumed'
    );

    // A second-factor challenge cannot be used for a primary login.
    const secondFactor = await call(conn, 'generateWebAuthnAuthenticationOptions', {
      mode: 'secondFactor',
      selector: { username },
    });
    await expectError(
      test,
      call(conn, 'login', {
        webauthn: await key.assert({ challenge: secondFactor.challenge }),
      }),
      'webauthn-challenge-invalid',
      'challenge for another ceremony'
    );
  })
);

Tinytest.addAsync(
  'accounts-webauthn - counter rollback, wrong origin, tampering and missing user verification are rejected',
  test =>
    withRegisteredKey(test, async ({ conn, userId, key }) => {
      const first = await loginWithKey(conn, key);
      test.equal(first.id, userId);
      await call(conn, 'logout');

      await expectError(
        test,
        loginWithKey(conn, key, { counter: 1 }),
        'webauthn-counter-mismatch',
        'counter did not increase'
      );
      test.equal(
        (await getUser(userId)).services.webauthn.credentials[0].counter,
        1,
        'stored counter is left untouched'
      );

      await expectError(
        test,
        loginWithKey(conn, key, { origin: 'https://evil.example' }),
        'invalid-webauthn-assertion',
        'wrong origin'
      );
      await expectError(
        test,
        loginWithKey(conn, key, { rpID: 'evil.example' }),
        'invalid-webauthn-assertion',
        'wrong relying party id'
      );
      await expectError(
        test,
        loginWithKey(conn, key, { userVerified: false }),
        'invalid-webauthn-assertion',
        'user verification is required for primary login'
      );

      const options = await call(conn, 'generateWebAuthnAuthenticationOptions', {
        mode: 'login',
      });
      const tampered = await key.assert({ challenge: options.challenge });
      tampered.response.signature = tampered.response.signature.replace(/.$/, c =>
        c === 'A' ? 'B' : 'A'
      );
      await expectError(
        test,
        call(conn, 'login', { webauthn: tampered }),
        'invalid-webauthn-assertion',
        'tampered signature'
      );

      const ok = await loginWithKey(conn, key);
      test.equal(ok.id, userId, 'a valid assertion still logs in');
    })
);

Tinytest.addAsync(
  'accounts-webauthn - a credential id cannot be registered twice',
  async test => {
    const a = await createPasswordUser();
    const b = await createPasswordUser();
    const key = await newAuthenticator();
    try {
      await withConnection(test, async conn => {
        await loginWithPassword(conn, a.username, a.password);
        await registerCredential(conn, key, 'A');
        await call(conn, 'logout');

        await loginWithPassword(conn, b.username, b.password);
        const forB = await call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'addCredential',
        });
        await expectError(
          test,
          call(conn, 'registerWebAuthnCredential', {
            credential: key.register({ challenge: forB.challenge }),
          }),
          'webauthn-credential-in-use',
          'another user owns the credential'
        );
        await call(conn, 'logout');

        await loginWithPassword(conn, a.username, a.password);
        const forA = await call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'addCredential',
        });
        test.equal(
          forA.excludeCredentials.map(credential => credential.id),
          [key.credentialId],
          'registered keys are excluded from new registrations'
        );
        await expectError(
          test,
          call(conn, 'registerWebAuthnCredential', {
            credential: key.register({ challenge: forA.challenge }),
          }),
          'webauthn-credential-in-use',
          'the same user cannot register the credential twice'
        );
      });
    } finally {
      await cleanup(a.userId, b.userId);
    }
  }
);

Tinytest.addAsync(
  'accounts-webauthn - registration is verified and can be vetoed',
  async test => {
    const key = await newAuthenticator();
    const seen = [];
    // Stops itself while the hooks run; the veto below must still be reached.
    const once = Accounts.validateWebAuthnRegistration(() => {
      once.stop();
    });
    const hook = Accounts.validateWebAuthnRegistration((info, context) => {
      seen.push({ info, context });
      return false;
    });
    try {
      await withLoggedInUser(test, async ({ conn, userId }) => {
        const junk = await call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'addCredential',
        });
        const malformed = key.register({ challenge: junk.challenge });
        malformed.response.transports = 'usb';
        await expectError(
          test,
          call(conn, 'registerWebAuthnCredential', { credential: malformed }),
          400,
          'transports must be a list of strings'
        );

        const wrongRp = await call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'addCredential',
        });
        await expectError(
          test,
          call(conn, 'registerWebAuthnCredential', {
            credential: key.register({ challenge: wrongRp.challenge, rpID: 'evil.example' }),
          }),
          'invalid-webauthn-registration',
          'wrong relying party id'
        );

        const unverified = await call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'addCredential',
        });
        await expectError(
          test,
          call(conn, 'registerWebAuthnCredential', {
            credential: key.register({
              challenge: unverified.challenge,
              userVerified: false,
            }),
          }),
          'invalid-webauthn-registration',
          'user verification is required to register a key'
        );

        const vetoed = await call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'addCredential',
        });
        await expectError(
          test,
          call(conn, 'registerWebAuthnCredential', {
            credential: key.register({ challenge: vetoed.challenge }),
          }),
          'webauthn-registration-rejected',
          'validation hook returned false'
        );
        test.equal(seen.length, 1);
        test.equal(seen[0].context, { userId, mode: 'addCredential' });
        test.equal(seen[0].info.credentialId, key.credentialId);
        test.equal(seen[0].info.fmt, 'none');
        test.equal(seen[0].info.deviceType, 'singleDevice');
        test.equal(seen[0].info.transports, ['usb']);

        hook.stop();
        const { credential } = await registerCredential(conn, key, 'Accepted');
        test.equal(credential.name, 'Accepted');
        test.equal(seen.length, 1, 'a stopped hook is not called');
      });
    } finally {
      once.stop();
      hook.stop();
    }
  }
);

Tinytest.addAsync(
  'accounts-webauthn - forged assertions fail alike for registered and unknown keys',
  test =>
    withRegisteredKey(test, async ({ conn, key }) => {
      await loginWithKey(conn, key);
      await call(conn, 'logout');
      const forger = await newAuthenticator();
      // A response signed by another key, claiming the given credential id
      // and a counter below the stored one.
      const forge = async id => {
        const options = await call(conn, 'generateWebAuthnAuthenticationOptions', {
          mode: 'login',
        });
        const assertion = await forger.assert({ challenge: options.challenge, counter: 0 });
        return call(conn, 'login', { webauthn: { ...assertion, id, rawId: id } });
      };
      await expectError(
        test,
        forge(key.credentialId),
        'invalid-webauthn-assertion',
        'a registered id with a forged signature does not reveal its counter'
      );
      await expectError(
        test,
        forge(forger.credentialId),
        'invalid-webauthn-assertion',
        'an unknown id fails with the same code'
      );
    })
);

Tinytest.addAsync(
  'accounts-webauthn - a key registered without user verification is a second factor only',
  async test => {
    const previous = Accounts._options.webauthn;
    Accounts._options.webauthn = { ...previous, userVerification: 'preferred' };
    try {
      await withLoggedInUser(test, async ({ conn, userId, username, password }) => {
        const key = await newAuthenticator();
        const options = await call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'addCredential',
        });
        test.equal(options.authenticatorSelection.userVerification, 'preferred');
        const stored = await call(conn, 'registerWebAuthnCredential', {
          credential: key.register({ challenge: options.challenge, userVerified: false }),
        });
        test.isFalse(stored.userVerified, 'the public view tells such a key apart');
        await call(conn, 'enableWebAuthnSecondFactor');
        await call(conn, 'logout');

        const loginOptions = await call(conn, 'generateWebAuthnAuthenticationOptions', {
          mode: 'login',
        });
        test.equal(
          loginOptions.userVerification,
          'required',
          'passwordless login always asks for verification'
        );
        await expectError(
          test,
          call(conn, 'login', {
            webauthn: await key.assert({ challenge: loginOptions.challenge }),
          }),
          'webauthn-second-factor-only'
        );

        // As a second factor the key works, verified or not.
        const secondFactor = await call(conn, 'generateWebAuthnAuthenticationOptions', {
          mode: 'secondFactor',
          selector: { username },
        });
        const result = await loginWithPassword(conn, username, password, {
          webauthn: await key.assert({
            challenge: secondFactor.challenge,
            userVerified: false,
          }),
        });
        test.equal(result.id, userId);
      });

      // Sign-up always requires verification: the new key is the only way in.
      await withConnection(test, async conn => {
        const signupKey = await newAuthenticator();
        const options = await call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'signup',
          userData: { username: `keyonly_${Random.id()}` },
        });
        test.equal(options.authenticatorSelection.userVerification, 'required');
        await expectError(
          test,
          call(conn, 'createUserWithWebAuthn', {
            credential: signupKey.register({
              challenge: options.challenge,
              userVerified: false,
            }),
          }),
          'invalid-webauthn-registration'
        );
      });
    } finally {
      Accounts._options.webauthn = previous;
    }
  }
);

Tinytest.addAsync(
  'accounts-webauthn - the login handler leaves password and token logins alone',
  async test => {
    const { handler } = Accounts._loginHandlers.find(({ name }) => name === 'webauthn');
    const webauthn = await (await newAuthenticator()).assert({ challenge: 'unused' });
    test.isUndefined(await handler.call({}, { user: { username: 'x' }, password: 'x', webauthn }));
    test.isUndefined(await handler.call({}, { selector: 'x', token: 'x', webauthn }));
    test.isUndefined(await handler.call({}, { user: { username: 'x' }, password: 'x' }));
  }
);

Tinytest.addAsync('accounts-webauthn - passwordless login can be turned off', async test => {
  const previous = Accounts._options.webauthn;
  Accounts._options.webauthn = { ...previous, passwordlessLogin: false };
  try {
    await withRegisteredKey(test, async ({ conn, username, key }) => {
      await expectError(
        test,
        call(conn, 'generateWebAuthnAuthenticationOptions', { mode: 'login' }),
        'webauthn-passwordless-disabled'
      );
      await expectError(
        test,
        call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'signup',
          userData: { username: `keyonly_${Random.id()}` },
        }),
        'webauthn-passwordless-disabled'
      );
      await expectError(
        test,
        call(conn, 'login', { webauthn: await key.assert({ challenge: 'unused' }) }),
        'webauthn-passwordless-disabled'
      );
      // Second-factor use is unaffected.
      const secondFactor = await call(conn, 'generateWebAuthnAuthenticationOptions', {
        mode: 'secondFactor',
        selector: { username },
      });
      test.isTrue(typeof secondFactor.challenge === 'string');
    });
  } finally {
    Accounts._options.webauthn = previous;
  }
});

Tinytest.addAsync('accounts-webauthn - sign up with only a security key', async test => {
  const email = `${Random.id()}@example.com`.toLowerCase();
  const key = await newAuthenticator();
  let userId;
  try {
    await withConnection(test, async conn => {
      const options = await call(conn, 'generateWebAuthnRegistrationOptions', {
        mode: 'signup',
        name: 'First key',
        userData: { email, profile: { name: 'Key User' } },
      });
      test.equal(options.user.name, email);
      test.equal(options.authenticatorSelection.userVerification, 'required');

      const result = await call(conn, 'createUserWithWebAuthn', {
        credential: key.register({ challenge: options.challenge }),
      });
      userId = result.id;
      test.equal(result.type, 'webauthn');
      test.isTrue(typeof result.token === 'string' && result.token.length > 0);

      const user = await getUser(userId);
      test.equal(user.emails[0].address, email);
      test.equal(user.profile.name, 'Key User');
      test.equal(user.services.webauthn.userHandle, options.user.id);
      test.isTrue(
        user.services.webauthn.secondFactorEnabled,
        'the key stays required if a password is set later'
      );
      test.equal(user.services.webauthn.credentials[0].name, 'First key');

      // The connection is logged in as the new user.
      const list = await call(conn, 'listWebAuthnCredentials');
      test.equal(list.map(credential => credential.name), ['First key']);
      test.isFalse(await call(conn, 'hasWebAuthnSecondFactorEnabled'));
      await call(conn, 'logout');

      const login = await loginWithKey(conn, key, { userHandle: options.user.id });
      test.equal(login.id, userId);
    });
  } finally {
    await cleanup(userId);
  }
});

Tinytest.addAsync(
  'accounts-webauthn - sign up respects account creation rules',
  async test => {
    const existing = await createPasswordUser();
    const key = await newAuthenticator();
    try {
      await withConnection(test, async conn => {
        await expectError(
          test,
          call(conn, 'generateWebAuthnRegistrationOptions', {
            mode: 'signup',
            userData: { username: existing.username.toUpperCase() },
          }),
          403,
          'duplicate username fails before the ceremony'
        );
        await expectError(
          test,
          call(conn, 'generateWebAuthnRegistrationOptions', {
            mode: 'signup',
            userData: {},
          }),
          400,
          'a username or email is required'
        );

        const options = await call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'signup',
          userData: { username: `nu_${Random.id()}` },
        });
        Accounts._options.forbidClientAccountCreation = true;
        try {
          await expectError(
            test,
            call(conn, 'generateWebAuthnRegistrationOptions', {
              mode: 'signup',
              userData: { username: `nu_${Random.id()}` },
            }),
            403,
            'forbidClientAccountCreation blocks the options'
          );
          await expectError(
            test,
            call(conn, 'createUserWithWebAuthn', {
              credential: key.register({ challenge: options.challenge }),
            }),
            403,
            'forbidClientAccountCreation blocks the completion'
          );
        } finally {
          Accounts._options.forbidClientAccountCreation = false;
        }
      });
    } finally {
      await cleanup(existing.userId);
    }
  }
);

Tinytest.addAsync(
  'accounts-webauthn - the last key cannot be removed without another login method',
  async test => {
    const username = `keyonly_${Random.id()}`;
    const key = await newAuthenticator();
    const backup = await newAuthenticator();
    let userId;
    try {
      await withConnection(test, async conn => {
        const options = await call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'signup',
          name: 'Primary',
          userData: { username },
        });
        userId = (
          await call(conn, 'createUserWithWebAuthn', {
            credential: key.register({ challenge: options.challenge }),
          })
        ).id;

        const [primary] = await call(conn, 'listWebAuthnCredentials');
        await expectError(
          test,
          call(conn, 'removeWebAuthnCredential', primary.id),
          'webauthn-last-credential'
        );

        const { credential: second } = await registerCredential(conn, backup, 'Second');
        await call(conn, 'renameWebAuthnCredential', second.id, 'Backup');
        // Renaming to the current name changes nothing and is not an error.
        await call(conn, 'renameWebAuthnCredential', second.id, 'Backup');
        await expectError(
          test,
          call(conn, 'renameWebAuthnCredential', second.id, 'x'.repeat(101)),
          400,
          'labels are capped at 100 characters'
        );
        test.equal(
          (await call(conn, 'listWebAuthnCredentials')).map(credential => credential.name),
          ['Primary', 'Backup']
        );
        await call(conn, 'removeWebAuthnCredential', second.id);
        test.equal(
          (await call(conn, 'listWebAuthnCredentials')).map(credential => credential.name),
          ['Primary']
        );
        await expectError(
          test,
          call(conn, 'removeWebAuthnCredential', second.id),
          'webauthn-credential-not-found'
        );
        await expectError(
          test,
          call(conn, 'renameWebAuthnCredential', second.id, 'Gone'),
          'webauthn-credential-not-found'
        );

        // Once a password is set the last key can go, and the second-factor
        // requirement is cleared with it.
        await Accounts.setPasswordAsync(userId, Random.secret(), { logout: false });
        await call(conn, 'enableWebAuthnSecondFactor');
        await call(conn, 'removeWebAuthnCredential', primary.id);
        const user = await getUser(userId);
        test.equal(user.services.webauthn.credentials, []);
        test.isFalse(user.services.webauthn.secondFactorEnabled);
        await expectError(
          test,
          call(conn, 'enableWebAuthnSecondFactor'),
          'no-webauthn-credential'
        );
      });
    } finally {
      await cleanup(userId);
    }
  }
);

Tinytest.addAsync('accounts-webauthn - second factor for password login', async test => {
  const other = await createPasswordUser();
  const key = await newAuthenticator();
  try {
    await withLoggedInUser(test, async ({ conn, userId, username, password }) => {
      await expectError(
        test,
        call(conn, 'enableWebAuthnSecondFactor'),
        'no-webauthn-credential'
      );
      await registerCredential(conn, key, 'Key');
      await call(conn, 'enableWebAuthnSecondFactor');
      test.isTrue(await call(conn, 'hasWebAuthnSecondFactorEnabled'));
      await call(conn, 'logout');

      const missing = await expectError(
        test,
        loginWithPassword(conn, username, password),
        'no-webauthn-assertion'
      );
      test.equal(missing.details, { availableFactors: ['webauthn'] });
      test.equal(missing.reason, 'A security key assertion is required');

      await expectError(
        test,
        loginWithPassword(conn, username, 'wrong'),
        403,
        'a wrong password fails before the second factor'
      );

      const options = await call(conn, 'generateWebAuthnAuthenticationOptions', {
        mode: 'secondFactor',
        selector: { username },
      });
      test.equal(options.userVerification, 'preferred');
      test.equal(
        options.allowCredentials.map(credential => credential.id),
        [key.credentialId]
      );
      await expectError(
        test,
        call(conn, 'generateWebAuthnAuthenticationOptions', { mode: 'secondFactor' }),
        400,
        'a second-factor challenge needs a selector'
      );

      // User verification is not required for the second factor.
      const assertion = await key.assert({
        challenge: options.challenge,
        userVerified: false,
      });
      const result = await loginWithPassword(conn, username, password, {
        webauthn: assertion,
      });
      test.equal(result.id, userId);
      test.equal(result.type, 'password');
      await call(conn, 'logout');

      await expectError(
        test,
        loginWithPassword(conn, username, password, { webauthn: assertion }),
        'webauthn-challenge-invalid',
        'replayed second factor'
      );

      const loginChallenge = await call(conn, 'generateWebAuthnAuthenticationOptions', {
        mode: 'login',
        selector: { username },
      });
      await expectError(
        test,
        loginWithPassword(conn, username, password, {
          webauthn: await key.assert({ challenge: loginChallenge.challenge }),
        }),
        'webauthn-challenge-invalid',
        'a primary-login challenge is not a second-factor challenge'
      );

      const forOther = await call(conn, 'generateWebAuthnAuthenticationOptions', {
        mode: 'secondFactor',
        selector: { username: other.username },
      });
      await expectError(
        test,
        loginWithPassword(conn, username, password, {
          webauthn: await key.assert({ challenge: forOther.challenge }),
        }),
        'webauthn-challenge-invalid',
        'a challenge issued for another user'
      );

      const again = await call(conn, 'generateWebAuthnAuthenticationOptions', {
        mode: 'secondFactor',
        selector: { username },
      });
      await loginWithPassword(conn, username, password, {
        webauthn: await key.assert({ challenge: again.challenge }),
      });
      await call(conn, 'disableWebAuthnSecondFactor');
      test.isFalse(await call(conn, 'hasWebAuthnSecondFactorEnabled'));
      await call(conn, 'logout');
      const plain = await loginWithPassword(conn, username, password);
      test.equal(plain.id, userId, 'plain password login works again');
    });
  } finally {
    await cleanup(other.userId);
  }
});

Tinytest.addAsync(
  'accounts-webauthn - any enabled second factor satisfies the login',
  test =>
    withRegisteredKey(test, async ({ conn, userId, username, password, key }) => {
      await Meteor.users.updateAsync(userId, {
        $set: {
          'services.twoFactorAuthentication': { secret: TOTP_SECRET, type: 'otp' },
        },
      });

      const missing = await expectError(
        test,
        loginWithPassword(conn, username, password),
        'second-factor-required'
      );
      test.equal([...missing.details.availableFactors].sort(), ['totp', 'webauthn']);

      const { token } = Accounts._generate2faToken(TOTP_SECRET);
      const withCode = await loginWithPassword(conn, username, password, { code: token });
      test.equal(withCode.id, userId, 'the authenticator code alone is enough');
      await call(conn, 'logout');

      await expectError(
        test,
        loginWithPassword(conn, username, password, { code: '000000' }),
        'invalid-2fa-code'
      );

      const options = await call(conn, 'generateWebAuthnAuthenticationOptions', {
        mode: 'secondFactor',
        selector: { username },
      });
      const withKey = await loginWithPassword(conn, username, password, {
        webauthn: await key.assert({ challenge: options.challenge }),
      });
      test.equal(withKey.id, userId, 'the security key alone is enough');
      await call(conn, 'logout');

      // With only TOTP enabled the historical error code is preserved.
      await Meteor.users.updateAsync(userId, {
        $set: { 'services.webauthn.secondFactorEnabled': false },
      });
      const legacy = await expectError(
        test,
        loginWithPassword(conn, username, password),
        'no-2fa-code'
      );
      test.equal(legacy.details, { availableFactors: ['totp'] });
    }, { secondFactor: true })
);

Tinytest.addAsync(
  'accounts-webauthn - second factor for passwordless login',
  async test => {
    const email = `${Random.id()}@example.com`.toLowerCase();
    const password = Random.secret();
    const userId = await Accounts.createUserAsync({ email, password });
    const key = await newAuthenticator();
    const originalSend = Accounts.sendLoginTokenEmail;
    let sequence;
    Accounts.sendLoginTokenEmail = async options => {
      sequence = options.sequence;
    };
    try {
      await withConnection(test, async conn => {
        await call(conn, 'login', { user: { email }, password });
        await registerCredential(conn, key);
        await call(conn, 'enableWebAuthnSecondFactor');
        await call(conn, 'logout');

        await call(conn, 'requestLoginTokenForUser', {
          selector: { email },
          userData: { email },
        });
        test.isTrue(typeof sequence === 'string' && sequence.length > 0);

        await expectError(
          test,
          call(conn, 'login', { selector: { email }, token: sequence }),
          'no-webauthn-assertion'
        );

        // The one-time token survives the missing second factor.
        const options = await call(conn, 'generateWebAuthnAuthenticationOptions', {
          mode: 'secondFactor',
          selector: { email },
        });
        const result = await call(conn, 'login', {
          selector: { email },
          token: sequence,
          webauthn: await key.assert({ challenge: options.challenge }),
        });
        test.equal(result.id, userId);
        test.equal(result.type, 'passwordless');
      });
    } finally {
      Accounts.sendLoginTokenEmail = originalSend;
      await cleanup(userId);
    }
  }
);

Tinytest.addAsync(
  'accounts-webauthn - requireTotpOnLogin also asks for the authenticator code',
  async test => {
    const previous = Accounts._options.webauthn;
    Accounts._options.webauthn = { requireTotpOnLogin: true };
    try {
      await withRegisteredKey(test, async ({ conn, userId, key }) => {
        const noTotp = await loginWithKey(conn, key);
        test.equal(noTotp.id, userId, 'users without TOTP are not affected');
        await call(conn, 'logout');

        await Meteor.users.updateAsync(userId, {
          $set: {
            'services.twoFactorAuthentication': { secret: TOTP_SECRET, type: 'otp' },
          },
        });
        await expectError(test, loginWithKey(conn, key), 'no-2fa-code');

        const options = await call(conn, 'generateWebAuthnAuthenticationOptions', {
          mode: 'login',
        });
        const result = await call(conn, 'login', {
          webauthn: await key.assert({ challenge: options.challenge }),
          code: Accounts._generate2faToken(TOTP_SECRET).token,
        });
        test.equal(result.id, userId);
      });
    } finally {
      Accounts._options.webauthn = previous;
    }
  }
);

Tinytest.addAsync(
  'accounts-webauthn - ambiguous error messages hide reasons but keep codes',
  async test => {
    const key = await newAuthenticator();
    Accounts._options.ambiguousErrorMessages = true;
    try {
      await withConnection(test, async conn => {
        const error = await expectError(
          test,
          loginWithKey(conn, key),
          'invalid-webauthn-assertion',
          'unregistered key'
        );
        test.equal(error.reason, 'Something went wrong. Please check your credentials.');
      });
    } finally {
      Accounts._options.ambiguousErrorMessages = false;
      await cleanup();
    }
  }
);

Tinytest.addAsync('accounts-webauthn - methods require a logged-in user', async test => {
  await withConnection(test, async conn => {
    const calls = [
      ['listWebAuthnCredentials'],
      ['enableWebAuthnSecondFactor'],
      ['disableWebAuthnSecondFactor'],
      ['hasWebAuthnSecondFactorEnabled'],
      ['renameWebAuthnCredential', 'id', 'name'],
      ['removeWebAuthnCredential', 'id'],
      ['generateWebAuthnRegistrationOptions', { mode: 'addCredential' }],
    ];
    for (const [name, ...args] of calls) {
      await expectError(test, call(conn, name, ...args), 'no-logged-user', name);
    }
  });
});

Tinytest.addAsync(
  'accounts-webauthn - challenge-issuing methods are rate limited by default',
  async test => {
    Accounts.addDefaultRateLimit();
    try {
      await withConnection(test, async conn => {
        for (let i = 0; i < 5; i += 1) {
          await call(conn, 'generateWebAuthnAuthenticationOptions', { mode: 'login' });
        }
        await expectError(
          test,
          call(conn, 'generateWebAuthnAuthenticationOptions', { mode: 'login' }),
          'too-many-requests'
        );
      });
    } finally {
      Accounts.removeDefaultRateLimit();
      await cleanup();
    }
  }
);

Tinytest.addAsync(
  'accounts-webauthn - concurrent removals cannot strip the last key',
  async test => {
    const username = `keyonly_${Random.id()}`;
    const keyA = await newAuthenticator();
    const keyB = await newAuthenticator();
    let userId;
    try {
      await withConnection(test, async first => {
        await withConnection(test, async second => {
          const options = await call(first, 'generateWebAuthnRegistrationOptions', {
            mode: 'signup',
            userData: { username },
          });
          userId = (
            await call(first, 'createUserWithWebAuthn', {
              credential: keyA.register({ challenge: options.challenge }),
            })
          ).id;
          const { credential: secondKey } = await registerCredential(first, keyB, 'B');
          await loginWithKey(second, keyA, { userHandle: options.user.id });

          // Two sessions remove a different key each at the same time; only
          // one removal may succeed because nothing else can log this user in.
          const results = await Promise.allSettled([
            call(first, 'removeWebAuthnCredential', keyA.credentialId),
            call(second, 'removeWebAuthnCredential', secondKey.id),
          ]);
          test.equal(
            results.map(result => result.status).sort(),
            ['fulfilled', 'rejected']
          );
          const rejected = results.find(result => result.status === 'rejected');
          test.equal(rejected.reason.error, 'webauthn-last-credential');
          test.equal((await call(first, 'listWebAuthnCredentials')).length, 1);
        });
      });
    } finally {
      await cleanup(userId);
    }
  }
);

Tinytest.addAsync(
  'accounts-webauthn - a password reset does not log in past the second factor',
  async test => {
    const email = `${Random.id()}@example.com`.toLowerCase();
    const password = Random.secret();
    const userId = await Accounts.createUserAsync({ email, password });
    const key = await newAuthenticator();
    try {
      await withConnection(test, async conn => {
        await call(conn, 'login', { user: { email }, password });
        await registerCredential(conn, key);
        await call(conn, 'enableWebAuthnSecondFactor');
        await call(conn, 'logout');

        const { token } = await Accounts.generateResetToken(userId, email, 'resetPassword');
        const error = await expectError(
          test,
          call(conn, 'resetPassword', token, Random.secret()),
          '2fa-enabled'
        );
        test.equal(error.details, { availableFactors: ['webauthn'] });
        await expectError(
          test,
          call(conn, 'listWebAuthnCredentials'),
          'no-logged-user',
          'the connection stays logged out'
        );
      });
    } finally {
      await cleanup(userId);
    }
  }
);

Tinytest.addAsync(
  'accounts-webauthn - key changes are reported to onWebAuthnCredentialChange',
  async test => {
    const changes = [];
    // Stops itself on the first change; the listeners after it must still run.
    const once = Accounts.onWebAuthnCredentialChange(() => {
      once.stop();
    });
    const listener = Accounts.onWebAuthnCredentialChange(change => {
      changes.push(change);
    });
    const failing = Accounts.onWebAuthnCredentialChange(() => {
      throw new Error('listener failure');
    });
    const username = `keyonly_${Random.id()}`;
    const signupKey = await newAuthenticator();
    let signupUserId;
    try {
      await withLoggedInUser(test, async ({ conn, userId }) => {
        const key = await newAuthenticator();
        const { credential } = await registerCredential(conn, key, 'Key');
        await call(conn, 'renameWebAuthnCredential', credential.id, 'Renamed');
        await call(conn, 'removeWebAuthnCredential', credential.id);

        test.equal(changes.map(change => change.action), ['added', 'renamed', 'removed']);
        test.equal(changes.map(change => change.credential.name), ['Key', 'Renamed', 'Renamed']);
        test.isTrue(
          changes.every(
            change => change.userId === userId && change.credential.id === key.credentialId
          )
        );
        test.isTrue(
          changes.every(change => change.credential.publicKey === undefined),
          'listeners receive the public view of the key'
        );
      });

      await withConnection(test, async conn => {
        const options = await call(conn, 'generateWebAuthnRegistrationOptions', {
          mode: 'signup',
          name: 'First',
          userData: { username },
        });
        signupUserId = (
          await call(conn, 'createUserWithWebAuthn', {
            credential: signupKey.register({ challenge: options.challenge }),
          })
        ).id;
        test.equal(changes.at(-1).action, 'added');
        test.equal(changes.at(-1).userId, signupUserId);
        test.equal(changes.at(-1).credential.name, 'First');

        listener.stop();
        failing.stop();
        await registerCredential(conn, await newAuthenticator(), 'Silent');
        test.equal(changes.length, 4, 'a stopped listener is not called');
      });
    } finally {
      once.stop();
      listener.stop();
      failing.stop();
      await cleanup(signupUserId);
    }
  }
);
