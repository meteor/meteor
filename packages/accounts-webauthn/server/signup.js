import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check, Match } from 'meteor/check';
import { toCredentialDoc, publicCredentialView } from './credential_store.js';
import {
  registrationResponsePattern,
  verifyNewCredential,
} from './ceremonies.js';
import { notifyCredentialChange } from './hooks.js';

// Completes a `signup` registration ceremony: verifies the new credential,
// creates the user with it as the only login method, and returns the id so
// the login method logs the client in. Exported for tests.
export async function completeWebAuthnSignup(options) {
  check(options, {
    credential: registrationResponsePattern,
    credentialName: Match.Optional(Match.NonEmptyString),
  });
  if (Accounts._options.forbidClientAccountCreation) {
    return { error: new Meteor.Error(403, 'Signups forbidden') };
  }

  const { challengeDoc, registrationInfo } = await verifyNewCredential({
    credential: options.credential,
    mode: 'signup',
  });

  const pendingUser = challengeDoc.pendingUser || {};
  const { username, email, profile } = pendingUser;
  const credentialDoc = toCredentialDoc(
    registrationInfo,
    options.credentialName || pendingUser.credentialName
  );
  const user = {
    services: {
      webauthn: {
        userHandle: challengeDoc.userHandle,
        secondFactorEnabled: false,
        credentials: [credentialDoc],
      },
    },
    ...(profile ? { profile } : {}),
  };

  const userId = await Accounts._createUserCheckingDuplicates({
    user,
    username,
    email,
    options: pendingUser,
  });
  await notifyCredentialChange({
    userId,
    action: 'added',
    credential: publicCredentialView(credentialDoc),
  });
  return { userId };
}

Meteor.methods({
  // Login method: the client calls it through Accounts.callLoginMethod so a
  // successful sign-up also logs the new user in.
  async createUserWithWebAuthn(...args) {
    return Accounts._loginMethod(
      this,
      'createUserWithWebAuthn',
      args,
      'webauthn',
      () => completeWebAuthnSignup(args[0] || {})
    );
  },
});
