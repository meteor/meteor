import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

/**
 * Runs `fn` with `window.PublicKeyCredential` removed, so the browser reports
 * no WebAuthn support.
 * @param {Function} fn
 * @returns {Promise<void>}
 */
const withoutWebAuthn = async fn => {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'PublicKeyCredential');
  Object.defineProperty(window, 'PublicKeyCredential', {
    value: undefined,
    configurable: true,
    writable: true,
  });
  try {
    await fn();
  } finally {
    if (descriptor) {
      Object.defineProperty(window, 'PublicKeyCredential', descriptor);
    } else {
      delete window.PublicKeyCredential;
    }
  }
};

/**
 * Asserts that a promise rejects with the given error code.
 * @param {Object} test
 * @param {Promise} promise
 * @param {String} code
 * @returns {Promise<void>}
 */
const rejectsWithCode = (test, promise, code) =>
  promise.then(
    () => test.fail({ message: `expected rejection with ${code}` }),
    error => test.equal(error.error, code)
  );

Tinytest.add('accounts-webauthn - client - public API is defined', test => {
  [
    Meteor.loginWithWebAuthn,
    Meteor.loginWithWebAuthnAsync,
    Meteor.loginWithPasswordAndWebAuthn,
    Meteor.loginWithPasswordAndWebAuthnAsync,
    Meteor.passwordlessLoginWithTokenAndWebAuthn,
    Meteor.passwordlessLoginWithTokenAndWebAuthnAsync,
    Accounts.isWebAuthnSupported,
    Accounts.isWebAuthnPlatformAuthenticatorAvailable,
    Accounts.registerWebAuthnCredential,
    Accounts.registerWebAuthnCredentialAsync,
    Accounts.listWebAuthnCredentials,
    Accounts.listWebAuthnCredentialsAsync,
    Accounts.renameWebAuthnCredential,
    Accounts.renameWebAuthnCredentialAsync,
    Accounts.removeWebAuthnCredential,
    Accounts.removeWebAuthnCredentialAsync,
    Accounts.createUserWithWebAuthn,
    Accounts.createUserWithWebAuthnAsync,
    Accounts.enableWebAuthnSecondFactor,
    Accounts.enableWebAuthnSecondFactorAsync,
    Accounts.disableWebAuthnSecondFactor,
    Accounts.disableWebAuthnSecondFactorAsync,
    Accounts.hasWebAuthnSecondFactorEnabled,
    Accounts.hasWebAuthnSecondFactorEnabledAsync,
  ].forEach(fn => test.equal(typeof fn, 'function'));
  test.equal(typeof Accounts.isWebAuthnSupported(), 'boolean');
});

Tinytest.addAsync(
  'accounts-webauthn - client - arguments are validated before any ceremony',
  async test => {
    await new Promise(resolve => {
      Accounts.createUserWithWebAuthn({}, error => {
        test.equal(error.error, 400);
        resolve();
      });
    });
    await new Promise(resolve => {
      Accounts.renameWebAuthnCredential('', 'name', error => {
        test.equal(error.error, 400);
        resolve();
      });
    });
    await rejectsWithCode(test, Meteor.loginWithPasswordAndWebAuthnAsync('someone', 42), 400);
    await rejectsWithCode(test, Meteor.passwordlessLoginWithTokenAndWebAuthnAsync('someone', ''), 400);
    await rejectsWithCode(test, Accounts.removeWebAuthnCredentialAsync(''), 400);
    await rejectsWithCode(test, Accounts.registerWebAuthnCredentialAsync({ name: '' }), 400);
  }
);

Tinytest.addAsync(
  'accounts-webauthn - client - ceremonies fail cleanly when WebAuthn is unsupported',
  async test => {
    await withoutWebAuthn(async () => {
      test.isFalse(Accounts.isWebAuthnSupported());
      await rejectsWithCode(test, Meteor.loginWithWebAuthnAsync(), 'webauthn-not-supported');
      await new Promise(resolve => {
        Accounts.registerWebAuthnCredential('Key', error => {
          test.equal(error.error, 'webauthn-not-supported');
          resolve();
        });
      });
    });
  }
);

Tinytest.addAsync(
  'accounts-webauthn - client - authentication options round trip',
  async test => {
    const options = await new Promise((resolve, reject) => {
      Accounts.connection.call(
        'generateWebAuthnAuthenticationOptions',
        { mode: 'login' },
        (error, result) => (error ? reject(error) : resolve(result))
      );
    });
    test.isTrue(typeof options.challenge === 'string' && options.challenge.length > 0);
    test.isTrue(typeof options.rpId === 'string' && options.rpId.length > 0);
    test.equal(options.allowCredentials, []);
  }
);

Tinytest.addAsync(
  'accounts-webauthn - client - management methods require a logged-in user',
  async test => {
    await Meteor.logoutAsync?.().catch(() => {});
    await rejectsWithCode(test, Accounts.listWebAuthnCredentialsAsync(), 'no-logged-user');
    await rejectsWithCode(test, Accounts.hasWebAuthnSecondFactorEnabledAsync(), 'no-logged-user');
    await new Promise(resolve => {
      Accounts.hasWebAuthnSecondFactorEnabled(error => {
        test.equal(error.error, 'no-logged-user');
        resolve();
      });
    });
  }
);
