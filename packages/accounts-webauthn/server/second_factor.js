import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check } from 'meteor/check';
import { getWebAuthnConfig } from './config.js';
import { getCredentials } from './credential_store.js';
import {
  assertionResponsePattern,
  consumeChallengeForResponse,
  authenticateCredential,
} from './ceremonies.js';
import { requireUserId } from './util.js';

// True when password or passwordless login must also present a security key.
Accounts._checkWebAuthnSecondFactorEnabled = user =>
  !!(
    user?.services?.webauthn?.secondFactorEnabled &&
    getCredentials(user).length > 0
  );

// Verifies `options.webauthn` against a challenge issued for this user with
// generateWebAuthnAuthenticationOptions({ mode: 'secondFactor' }).
async function verifyWebAuthnSecondFactor(user, options) {
  const response = options.webauthn;
  check(response, assertionResponsePattern);
  const config = getWebAuthnConfig();

  const challengeDoc = await consumeChallengeForResponse(response, {
    type: 'authentication',
    mode: 'secondFactor',
    expectedUserId: user._id,
  });

  await authenticateCredential({
    user,
    response,
    challengeDoc,
    requireUserVerification: config.secondFactorUserVerification === 'required',
  });
}

Accounts.registerSecondFactor('webauthn', {
  isEnabledFor: user => Accounts._checkWebAuthnSecondFactorEnabled(user),
  isAvailableFor: user => getCredentials(user).length > 0,
  inputKey: 'webauthn',
  hasInput: options => !!options.webauthn,
  onMissingInput: () =>
    Accounts._handleError(
      'A security key assertion is required',
      true,
      'no-webauthn-assertion'
    ),
  verify: verifyWebAuthnSecondFactor,
});

Meteor.methods({
  async enableWebAuthnSecondFactor() {
    const userId = requireUserId(this);
    const user = await Meteor.users.findOneAsync(userId, {
      fields: { 'services.webauthn.credentials': 1 },
    });
    if (getCredentials(user).length === 0) {
      throw new Meteor.Error(
        'no-webauthn-credential',
        'Register a security key before enabling it as a second factor'
      );
    }
    await Meteor.users.updateAsync(userId, {
      $set: { 'services.webauthn.secondFactorEnabled': true },
    });
  },

  async disableWebAuthnSecondFactor() {
    const userId = requireUserId(this);
    await Meteor.users.updateAsync(userId, {
      $set: { 'services.webauthn.secondFactorEnabled': false },
    });
  },

  async hasWebAuthnSecondFactorEnabled() {
    const userId = requireUserId(this);
    const user = await Meteor.users.findOneAsync(userId, {
      fields: { 'services.webauthn': 1 },
    });
    return Accounts._checkWebAuthnSecondFactorEnabled(user);
  },
});
