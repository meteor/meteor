import { createHmac } from 'crypto';
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { check, Match } from 'meteor/check';
import {
  generateRegistrationOptions,
  generateAuthenticationOptions,
} from '@simplewebauthn/server';
import { getWebAuthnConfig } from './config.js';
import { storeChallenge, getDecoySecret } from './collection.js';
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

/**
 * The credential descriptor sent to the browser in `allowCredentials` and
 * `excludeCredentials`.
 * @param {Object} credential The stored credential document.
 * @returns {Object} `{ id, transports }`.
 */
const toAllowedCredential = credential => ({
  id: credential.id,
  transports: credential.transports,
});

/**
 * Builds the decoy list a selector receives when it resolves to no
 * credentials, so the response does not reveal whether the account exists or
 * has keys (WebAuthn Level 3, section 14.6.3). The secret is shared by every
 * server process and survives restarts, so a decoy is as stable as a real
 * list.
 * @param {Object} selector `{ id }`, `{ username }` or `{ email }`.
 * @returns {Promise<Array>} One credential descriptor.
 */
const decoyCredentials = async selector => {
  const [field, value] = Object.entries(selector)[0];
  const id = createHmac('sha256', await getDecoySecret())
    .update(`${field}:${String(value).toLowerCase()}`)
    .digest('base64url');
  return [{ id, transports: ['internal', 'hybrid'] }];
};

/**
 * Loads one credential of the logged-in user.
 * @param {String} userId
 * @param {String} id The credential id.
 * @returns {Promise<Object>} The credential document.
 * @throws {Meteor.Error} `webauthn-credential-not-found`
 */
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

/**
 * Issues registration options and records their challenge. A key may later be
 * the only way into the account, so registration always asks for the
 * verification level of passwordless login, which makes an authenticator set
 * up a PIN when it needs one.
 * @param {Object} options
 * @param {String} options.userHandle The user handle, base64url encoded.
 * @param {String} options.userName The account name shown by the authenticator.
 * @param {String} options.displayName The display name shown by the authenticator.
 * @param {Array} [options.excludeCredentials] Descriptors of the keys already registered.
 * @param {Object} options.challenge Extra fields stored with the challenge, including `mode`.
 * @returns {Promise<Object>} `PublicKeyCredentialCreationOptionsJSON`.
 */
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

/**
 * Registration options for adding a key to an existing user.
 * @param {String} userId
 * @param {String} [name] A label for the key, stored with the challenge.
 * @returns {Promise<Object>} `PublicKeyCredentialCreationOptionsJSON`.
 * @throws {Meteor.Error} `no-logged-user` when the user does not exist.
 */
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

/**
 * Registration options for creating a new account with only a key. Fails
 * before the ceremony when sign-ups are forbidden or the identity is taken.
 * @param {Object} userData `{ username, email, profile }`.
 * @param {String} [name] A label for the key, stored with the challenge.
 * @returns {Promise<Object>} `PublicKeyCredentialCreationOptionsJSON`.
 */
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
  /**
   * Returns `PublicKeyCredentialCreationOptionsJSON` for `startRegistration()`.
   * `addCredential` adds a security key to the logged-in user; `signup`
   * starts creating a new account that `createUserWithWebAuthn` completes.
   * @param {Object} options
   * @param {String} options.mode `addCredential` or `signup`.
   * @param {String} [options.name] A label for the key.
   * @param {Object} [options.userData] The new account's `username`, `email` and `profile` for `signup`.
   * @returns {Promise<Object>}
   */
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

  /**
   * Returns `PublicKeyCredentialRequestOptionsJSON` for `startAuthentication()`.
   * `login` without a selector relies on discoverable credentials; with a
   * selector, and always for `secondFactor`, the credentials of that user are
   * listed.
   * @param {Object} options
   * @param {String} options.mode `login` or `secondFactor`.
   * @param {Object} [options.selector] `{ id }`, `{ username }` or `{ email }`; required for `secondFactor`.
   * @returns {Promise<Object>}
   */
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
          ? await decoyCredentials(selector)
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

  /**
   * Completes the `addCredential` ceremony for the logged-in user.
   * @param {Object} options
   * @param {Object} options.credential The registration response JSON.
   * @param {String} [options.name] A label for the key.
   * @returns {Promise<Object>} The public view of the stored credential.
   */
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

  /**
   * Lists the logged-in user's keys.
   * @returns {Promise<Array>} The public views of the stored credentials.
   */
  async listWebAuthnCredentials() {
    const userId = requireUserId(this);
    const user = await Meteor.users.findOneAsync(userId, {
      fields: { 'services.webauthn.credentials': 1 },
    });
    return getCredentials(user).map(publicCredentialView);
  },

  /**
   * Renames one of the logged-in user's keys.
   * @param {String} id The credential id.
   * @param {String} name The new label.
   * @returns {Promise<void>}
   * @throws {Meteor.Error} `webauthn-credential-not-found`
   */
  async renameWebAuthnCredential(id, name) {
    check(id, Match.NonEmptyString);
    check(name, Match.NonEmptyString);
    const userId = requireUserId(this);
    const credential = await findUserCredential(userId, id);
    if (name !== credential.name) {
      const renamed = await Meteor.users.updateAsync(
        { _id: userId, 'services.webauthn.credentials.id': id },
        { $set: { 'services.webauthn.credentials.$.name': name } }
      );
      // Removed between the lookup and the update.
      if (!renamed) {
        credentialNotFound();
      }
    }
    await notifyCredentialChange({
      userId,
      action: 'renamed',
      credential: publicCredentialView({ ...credential, name }),
    });
  },

  /**
   * Removes one of the logged-in user's keys. Removing the last credential is
   * refused when the account would be left with no way to log in.
   * @param {String} id The credential id.
   * @returns {Promise<void>}
   * @throws {Meteor.Error} `webauthn-last-credential` or `webauthn-credential-not-found`
   */
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
