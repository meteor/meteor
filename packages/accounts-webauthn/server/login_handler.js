import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check, Match } from 'meteor/check';
import { getWebAuthnConfig, assertPasswordlessLoginEnabled } from './config.js';
import { USER_FIELDS } from './credential_store.js';
import {
  assertionResponsePattern,
  consumeChallengeForResponse,
  authenticateCredential,
} from './ceremonies.js';

/**
 * Primary (passwordless) login handler. The client sends the JSON returned by
 * `startAuthentication()` as `options.webauthn`. The credential id identifies
 * the account, since ids are unique across all users. A challenge issued for
 * a specific user (identifier-first login) must be answered by that user, and
 * one issued for an unknown identifier cannot be answered at all.
 * User verification is always required and a key registered without it is
 * refused: on its own, a key must never be enough to get in.
 * @param {Object} options The login options.
 * @returns {Promise<Object|undefined>} `{ userId }` or `{ userId, error }`; `undefined` when the options are not a WebAuthn login.
 */
Accounts.registerLoginHandler('webauthn', async options => {
  // A password or token login that carries a key is answering a second-factor
  // challenge and belongs to that package's handler, whatever the load order.
  if (
    !options.webauthn ||
    options.password !== undefined ||
    options.token !== undefined
  ) {
    return undefined; // don't handle
  }
  assertPasswordlessLoginEnabled();

  check(options, {
    webauthn: assertionResponsePattern,
    code: Match.Optional(Match.NonEmptyString),
  });
  const response = options.webauthn;
  const config = getWebAuthnConfig();

  const challengeDoc = await consumeChallengeForResponse(response, {
    type: 'authentication',
    mode: 'login',
  });

  // Every failure below shares one error code, so a forged assertion cannot
  // tell a registered credential id from an unknown one.
  const rejected = message =>
    Accounts._handleError(message, true, 'invalid-webauthn-assertion');

  const user = await Meteor.users.findOneAsync(
    { 'services.webauthn.credentials.id': response.id },
    { fields: USER_FIELDS }
  );
  if (!user) {
    rejected('Security key not recognized');
  }

  try {
    // The signature comes first: the checks after it only run for the holder
    // of the key.
    const { credential } = await authenticateCredential({
      user,
      response,
      challengeDoc,
      requireUserVerification: true,
    });
    if (challengeDoc.bound && challengeDoc.userId !== user._id) {
      rejected('WebAuthn challenge was issued for a different user');
    }
    const userHandle = response.response.userHandle;
    if (userHandle && userHandle !== user.services.webauthn.userHandle) {
      rejected('WebAuthn user handle does not match the credential owner');
    }
    if (!credential.userVerified) {
      Accounts._handleError(
        'This security key was registered without user verification and can only be used as a second factor',
        true,
        'webauthn-second-factor-only'
      );
    }

    // Opt-in: also require the TOTP code from accounts-2fa. Restricted to
    // `totp` so the user is never asked for a second security key.
    if (config.requireTotpOnLogin) {
      await Accounts._verifySecondFactors(user, options, { only: ['totp'] });
    }
  } catch (error) {
    // Report the user so onLoginFailure hooks receive it.
    return { userId: user._id, error };
  }

  return { userId: user._id };
});
