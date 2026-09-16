import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check, Match } from 'meteor/check';
import { getWebAuthnConfig } from './config.js';
import { USER_FIELDS } from './credential_store.js';
import {
  assertionResponsePattern,
  consumeChallengeForResponse,
  authenticateCredential,
} from './ceremonies.js';

// Primary (passwordless) login. The client sends the JSON returned by
// startAuthentication() as `options.webauthn`. The credential id identifies
// the account, since ids are unique across all users. A challenge issued for
// a specific user (identifier-first login) must be answered by that user.
Accounts.registerLoginHandler('webauthn', async options => {
  if (!options.webauthn) {
    return undefined; // don't handle
  }

  check(
    options,
    Match.ObjectIncluding({
      webauthn: assertionResponsePattern,
      code: Match.Optional(Match.NonEmptyString),
    })
  );
  const response = options.webauthn;
  const config = getWebAuthnConfig();

  const challengeDoc = await consumeChallengeForResponse(response, {
    type: 'authentication',
    mode: 'login',
  });

  const user = await Meteor.users.findOneAsync(
    { 'services.webauthn.credentials.id': response.id },
    { fields: USER_FIELDS }
  );
  if (!user) {
    Accounts._handleError(
      'Security key not recognized',
      true,
      'invalid-webauthn-credential'
    );
  }

  try {
    if (challengeDoc.userId && challengeDoc.userId !== user._id) {
      Accounts._handleError(
        'WebAuthn challenge was issued for a different user',
        true,
        'webauthn-challenge-invalid'
      );
    }
    const userHandle = response.response.userHandle;
    if (userHandle && userHandle !== user.services.webauthn.userHandle) {
      Accounts._handleError(
        'WebAuthn user handle does not match the credential owner',
        true,
        'invalid-webauthn-credential'
      );
    }

    await authenticateCredential({
      user,
      response,
      challengeDoc,
      requireUserVerification: config.userVerification === 'required',
    });

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
