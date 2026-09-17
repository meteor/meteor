import { createHmac, randomBytes } from 'crypto';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check, Match } from 'meteor/check';
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
} from '@simplewebauthn/server';
import { getWebAuthnConfig } from './config.js';
import { storeChallenge } from './collection.js';
import {
  generateUserHandle,
  ensureUserHandle,
  userHandleToBytes,
} from './identity.js';
import {
  getCredentials,
  findCredential,
  credentialNotFound,
  publicCredentialView,
  toCredentialDoc,
  addCredentialToUser,
  removeCredentialFromUser,
  hasAlternativeLoginMethod,
} from './credential_store.js';
import {
  registrationResponsePattern,
  verifyNewCredential,
} from './ceremonies.js';
import { notifyCredentialChange } from './hooks.js';
import { requireUserId } from './util.js';

const userDataPattern = Match.ObjectIncluding({
  username: Match.Optional(String),
  email: Match.Optional(String),
  profile: Match.Optional(Object),
});

const toAllowedCredential = credential => ({
  id: credential.id,
  transports: credential.transports,
});

// A selector that resolves to no credentials receives a decoy list derived
// from the selector, so the response does not reveal whether the account
// exists or has keys (WebAuthn Level 3, section 14.6.3). The secret is per
// process, so a decoy is as stable as a real list for the server's lifetime.
const decoySecret = randomBytes(32);
const decoyCredentials = selector => {
  const [field, value] = Object.entries(selector)[0];
  const id = createHmac('sha256', decoySecret)
    .update(`${field}:${String(value).toLowerCase()}`)
    .digest('base64url');
  return [{ id, transports: ['internal', 'hybrid'] }];
};

// The credential `id` of the logged-in user, or the not-found error.
async function findUserCredential(userId, id) {
  const user = await Meteor.users.findOneAsync(userId, {
    fields: { 'services.webauthn.credentials': 1 },
  });
  const credential = findCredential(user, id);
  if (!credential) {
    credentialNotFound();
  }
  return credential;
}

// Issues registration options and records their challenge. A key may later be
// the only way into the account, so registration always asks for the
// verification level of passwordless login, which makes an authenticator set
// up a PIN when it needs one.
async function issueRegistrationOptions({
  userHandle,
  userName,
  displayName,
  excludeCredentials = [],
  challenge,
}) {
  const config = getWebAuthnConfig();
  const options = await generateRegistrationOptions({
    rpName: config.rpName,
    rpID: config.rpID,
    userName,
    userID: userHandleToBytes(userHandle),
    userDisplayName: displayName,
    attestationType: config.attestationType,
    excludeCredentials,
    authenticatorSelection: {
      residentKey: config.residentKey,
      userVerification: config.userVerification,
      authenticatorAttachment: config.authenticatorAttachment,
    },
    timeout: config.timeout,
  });
  await storeChallenge({
    challenge: options.challenge,
    type: 'registration',
    timeout: config.timeout,
    ...challenge,
  });
  return options;
}

async function registrationOptionsForUser(userId, name) {
  const user = await Meteor.users.findOneAsync(userId, {
    fields: { username: 1, emails: 1, 'services.webauthn': 1 },
  });
  if (!user) {
    throw new Meteor.Error('no-logged-user', 'No user logged in.');
  }
  const displayName = user.username || user.emails?.[0]?.address || '';
  return issueRegistrationOptions({
    userHandle: await ensureUserHandle(user),
    userName: displayName || user._id,
    displayName,
    excludeCredentials: getCredentials(user).map(toAllowedCredential),
    challenge: { mode: 'addCredential', userId: user._id, credentialName: name },
  });
}

async function registrationOptionsForSignup(userData, name) {
  check(userData, userDataPattern);
  const { username, email, profile } = userData;

  if (Accounts._options.forbidClientAccountCreation) {
    throw new Meteor.Error(403, 'Signups forbidden');
  }
  if (!username && !email) {
    throw new Meteor.Error(400, 'Need to set a username or email');
  }
  if (email && !Accounts._testEmailDomain(email)) {
    throw new Meteor.Error(403, 'User validation failed');
  }
  // Fail before the ceremony when the identity is already taken; the checks
  // run again when the user document is created.
  await Accounts._checkForCaseInsensitiveDuplicates('username', 'Username', username);
  await Accounts._checkForCaseInsensitiveDuplicates('emails.address', 'Email', email);

  const userHandle = generateUserHandle();
  const displayName = username || email;
  return issueRegistrationOptions({
    userHandle,
    userName: displayName,
    displayName,
    challenge: {
      mode: 'signup',
      userHandle,
      pendingUser: {
        ...(username ? { username } : {}),
        ...(email ? { email } : {}),
        ...(profile ? { profile } : {}),
        ...(name ? { credentialName: name } : {}),
      },
    },
  });
}

Meteor.methods({
  // Returns PublicKeyCredentialCreationOptionsJSON for startRegistration().
  // `addCredential` adds a security key to the logged-in user; `signup`
  // starts creating a new account that createUserWithWebAuthn completes.
  async generateWebAuthnRegistrationOptions(options = {}) {
    check(options, {
      mode: Match.OneOf('addCredential', 'signup'),
      name: Match.Optional(Match.NonEmptyString),
      userData: Match.Optional(Object),
    });
    if (options.mode === 'addCredential') {
      return registrationOptionsForUser(requireUserId(this), options.name);
    }
    if (this.userId) {
      throw new Meteor.Error(400, 'Already logged in');
    }
    return registrationOptionsForSignup(options.userData || {}, options.name);
  },

  // Returns PublicKeyCredentialRequestOptionsJSON for startAuthentication().
  // `login` without a selector relies on discoverable credentials; with a
  // selector, and always for `secondFactor`, the credentials of that user are
  // listed.
  async generateWebAuthnAuthenticationOptions(options = {}) {
    check(options, {
      mode: Match.OneOf('login', 'secondFactor'),
      selector: Match.Optional(Accounts._userQueryValidator),
    });
    const { mode, selector } = options;
    if (mode === 'secondFactor' && !selector) {
      throw new Meteor.Error(
        400,
        'A selector is required for a second-factor challenge'
      );
    }
    const config = getWebAuthnConfig();

    const user = selector
      ? await Accounts._findUserByQuery(selector, {
          fields: { 'services.webauthn': 1 },
        })
      : null;

    const credentials = getCredentials(user);
    const authenticationOptions = await generateAuthenticationOptions({
      rpID: config.rpID,
      allowCredentials:
        selector && credentials.length === 0
          ? decoyCredentials(selector)
          : credentials.map(toAllowedCredential),
      userVerification:
        mode === 'secondFactor'
          ? config.secondFactorUserVerification
          : config.userVerification,
      timeout: config.timeout,
    });

    await storeChallenge({
      challenge: authenticationOptions.challenge,
      type: 'authentication',
      mode,
      userId: user?._id ?? null,
      timeout: config.timeout,
    });

    return authenticationOptions;
  },

  // Completes the `addCredential` ceremony for the logged-in user.
  async registerWebAuthnCredential(options) {
    check(options, {
      credential: registrationResponsePattern,
      name: Match.Optional(Match.NonEmptyString),
    });
    const userId = requireUserId(this);
    const { challengeDoc, registrationInfo } = await verifyNewCredential({
      credential: options.credential,
      mode: 'addCredential',
      userId,
    });
    const credentialDoc = toCredentialDoc(
      registrationInfo,
      options.name || challengeDoc.credentialName
    );
    await addCredentialToUser(userId, credentialDoc);
    const credential = publicCredentialView(credentialDoc);
    await notifyCredentialChange({ userId, action: 'added', credential });
    return credential;
  },

  async listWebAuthnCredentials() {
    const userId = requireUserId(this);
    const user = await Meteor.users.findOneAsync(userId, {
      fields: { 'services.webauthn.credentials': 1 },
    });
    return getCredentials(user).map(publicCredentialView);
  },

  async renameWebAuthnCredential(id, name) {
    check(id, Match.NonEmptyString);
    check(name, Match.NonEmptyString);
    const userId = requireUserId(this);
    const credential = await findUserCredential(userId, id);
    await Meteor.users.updateAsync(
      { _id: userId, 'services.webauthn.credentials.id': id },
      { $set: { 'services.webauthn.credentials.$.name': name } }
    );
    await notifyCredentialChange({
      userId,
      action: 'renamed',
      credential: publicCredentialView({ ...credential, name }),
    });
  },

  // Removing the last credential is refused when the account would be left
  // with no way to log in.
  async removeWebAuthnCredential(id) {
    check(id, Match.NonEmptyString);
    const userId = requireUserId(this);
    const user = await Meteor.users.findOneAsync(userId, {
      fields: { services: 1, emails: 1 },
    });
    const credential = findCredential(user, id);
    if (!credential) {
      credentialNotFound();
    }
    const keepOne = !hasAlternativeLoginMethod(user);
    const removed = await removeCredentialFromUser(userId, id, { keepOne });
    if (!removed) {
      if (keepOne) {
        throw new Meteor.Error(
          'webauthn-last-credential',
          'Cannot remove the last security key: the account would have no way to log in'
        );
      }
      credentialNotFound();
    }
    await notifyCredentialChange({
      userId,
      action: 'removed',
      credential: publicCredentialView(credential),
    });
  },
});
