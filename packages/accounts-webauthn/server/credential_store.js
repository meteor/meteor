import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';

// Fields a login handler needs to verify a credential and any second factor.
export const USER_FIELDS = { services: 1, username: 1, emails: 1 };

// Services that never represent a way to log in on their own.
const INTERNAL_SERVICES = new Set([
  'resume',
  'email',
  'password',
  'passwordless',
  'twoFactorAuthentication',
  'webauthn',
]);

/**
 * Creates the unique indexes on the user handle and on credential ids.
 * @returns {Promise<void>}
 */
export async function setupUsersIndexes() {
  await Meteor.users.createIndexAsync('services.webauthn.userHandle', {
    unique: true,
    sparse: true,
  });
  await Meteor.users.createIndexAsync('services.webauthn.credentials.id', {
    unique: true,
    sparse: true,
  });
}

/**
 * Throws the error for a credential the logged-in user does not have.
 * @throws {Meteor.Error} `webauthn-credential-not-found`
 */
export const credentialNotFound = () => {
  throw new Meteor.Error('webauthn-credential-not-found', 'Security key not found');
};

/**
 * Throws the error for a credential id that is already registered.
 * @throws {Meteor.Error} `webauthn-credential-in-use`
 */
export const credentialInUse = () =>
  Accounts._handleError(
    'This security key is already registered',
    true,
    'webauthn-credential-in-use'
  );

/**
 * The credentials stored for a user.
 * @param {Object} [user] The user document.
 * @returns {Array} The credential documents, or an empty array.
 */
export const getCredentials = user => user?.services?.webauthn?.credentials || [];

/**
 * Finds one of a user's credentials by id.
 * @param {Object} user The user document.
 * @param {String} id The credential id.
 * @returns {Object|undefined} The credential document.
 */
export const findCredential = (user, id) =>
  getCredentials(user).find(credential => credential.id === id);

/**
 * Normalizes a stored public key: Mongo hands binary fields back as
 * `Uint8Array`, and a BSON `Binary` exposes its bytes as `buffer`.
 * @param {Uint8Array|Object} value The stored value.
 * @returns {Uint8Array}
 */
const toUint8Array = value =>
  value instanceof Uint8Array ? value : new Uint8Array(value.buffer);

/**
 * The shape `@simplewebauthn/server` expects for verification.
 * @param {Object} credential The stored credential document.
 * @returns {Object} `{ id, publicKey, counter, transports }`.
 */
export const toLibCredential = credential => ({
  id: credential.id,
  publicKey: toUint8Array(credential.publicKey),
  counter: credential.counter,
  transports: credential.transports,
});

/**
 * Builds the document stored under `services.webauthn.credentials`.
 * @param {Object} registrationInfo The library's verified registration info.
 * @param {String} [name] A label for the key; defaults to "Security key".
 * @returns {Object} The credential document.
 */
export function toCredentialDoc(registrationInfo, name) {
  const {
    credential,
    credentialDeviceType,
    credentialBackedUp,
    aaguid,
    fmt,
    userVerified,
  } = registrationInfo;
  return {
    id: credential.id,
    publicKey: new Uint8Array(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports || [],
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    aaguid,
    fmt,
    userVerified,
    name: name || 'Security key',
    createdAt: new Date(),
    lastUsedAt: null,
  };
}

/**
 * What the client is allowed to see: everything except the public key and
 * the verification internals.
 * @param {Object} credential The stored credential document.
 * @returns {Object} The public view of the credential.
 */
export const publicCredentialView = ({
  publicKey,
  counter,
  fmt,
  userVerified,
  ...view
}) => view;

/**
 * Whether a signature counter failed to increase. Authenticators that do not
 * implement a counter report 0 forever, which is the only allowed repeat.
 * @param {Number} storedCounter The counter stored with the credential.
 * @param {Number} newCounter The counter reported by the assertion.
 * @returns {Boolean} `true` when the authenticator may have been cloned.
 */
export function detectCounterRollback(storedCounter, newCounter) {
  if (newCounter === 0 && storedCounter === 0) {
    return false;
  }
  return newCounter <= storedCounter;
}

/**
 * Records a use of the credential. The stored counter is part of the query,
 * so two assertions verified against the same stored value cannot both
 * succeed: the second one finds the counter already advanced and is rejected.
 * @param {String} userId The owner of the credential.
 * @param {Object} credential The stored credential document, as loaded before verification.
 * @param {Object} authenticationInfo The library's `authenticationInfo`.
 * @returns {Promise<void>}
 * @throws {Meteor.Error} `webauthn-counter-mismatch` when the stored counter has already changed.
 */
export async function touchCredential(userId, credential, authenticationInfo) {
  const updated = await Meteor.users.updateAsync(
    {
      _id: userId,
      'services.webauthn.credentials': {
        $elemMatch: { id: credential.id, counter: credential.counter },
      },
    },
    {
      $set: {
        'services.webauthn.credentials.$.counter': authenticationInfo.newCounter,
        'services.webauthn.credentials.$.backedUp':
          authenticationInfo.credentialBackedUp,
        'services.webauthn.credentials.$.lastUsedAt': new Date(),
      },
    }
  );
  if (!updated) {
    Accounts._handleError(
      'WebAuthn signature counter was already advanced by another login',
      true,
      'webauthn-counter-mismatch'
    );
  }
}

/**
 * Whether a Mongo error is a unique index violation.
 * @param {Error} error
 * @returns {Boolean}
 */
const isDuplicateKeyError = error =>
  error?.code === 11000 || /E11000/.test(error?.errmsg || error?.message || '');

/**
 * Checks that no user holds the credential id yet. Credential ids are globally
 * unique; the unique index is the backstop and this check gives a clear error
 * before the ceremony result is discarded.
 * @param {String} credentialId
 * @returns {Promise<void>}
 * @throws {Meteor.Error} `webauthn-credential-in-use`
 */
export async function assertCredentialIdAvailable(credentialId) {
  const owner = await Meteor.users.findOneAsync(
    { 'services.webauthn.credentials.id': credentialId },
    { fields: { _id: 1 } }
  );
  if (owner) {
    credentialInUse();
  }
}

/**
 * Appends a credential to a user. The unique index rejects a credential id
 * held by another user, but not one repeated inside the same user's array, so
 * the query excludes that case too.
 * @param {String} userId
 * @param {Object} credentialDoc The credential document to store.
 * @returns {Promise<void>}
 * @throws {Meteor.Error} `webauthn-credential-in-use` when the id is already registered, or a 403 error when the user does not exist.
 */
export async function addCredentialToUser(userId, credentialDoc) {
  try {
    const updated = await Meteor.users.updateAsync(
      { _id: userId, 'services.webauthn.credentials.id': { $ne: credentialDoc.id } },
      { $push: { 'services.webauthn.credentials': credentialDoc } }
    );
    if (!updated) {
      const user = await Meteor.users.findOneAsync({ _id: userId }, { fields: { _id: 1 } });
      if (user) {
        credentialInUse();
      }
      Accounts._handleError('User not found');
    }
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      credentialInUse();
    }
    throw error;
  }
}

/**
 * Removes one credential. Unless the account can log in another way, the
 * removal only happens while a second credential remains; that condition is
 * part of the update itself, so concurrent removals cannot strip the last
 * credential.
 * @param {String} userId
 * @param {String} credentialId
 * @param {Object} options
 * @param {Boolean} options.keepOne Refuse to remove the last credential.
 * @returns {Promise<Boolean>} `false` when nothing was removed.
 */
export async function removeCredentialFromUser(userId, credentialId, { keepOne }) {
  const removed = await Meteor.users.updateAsync(
    {
      _id: userId,
      'services.webauthn.credentials.id': credentialId,
      ...(keepOne ? { 'services.webauthn.credentials.1': { $exists: true } } : {}),
    },
    { $pull: { 'services.webauthn.credentials': { id: credentialId } } }
  );
  if (!removed) {
    return false;
  }
  // With no credential left there is nothing to require as a second factor.
  await Meteor.users.updateAsync(
    { _id: userId, 'services.webauthn.credentials': { $size: 0 } },
    { $set: { 'services.webauthn.secondFactorEnabled': false } }
  );
  return true;
}

/**
 * Whether the user could still log in without any WebAuthn credential: a
 * password, an email address usable with accounts-passwordless, or an
 * external (OAuth) service.
 * @param {Object} user The user document with `services` and `emails`.
 * @returns {Boolean}
 */
export function hasAlternativeLoginMethod(user) {
  const services = user.services || {};
  if (services.password?.bcrypt || services.password?.argon2) {
    return true;
  }
  if (
    Package['accounts-passwordless'] &&
    (user.emails || []).some(email => email?.address)
  ) {
    return true;
  }
  return Object.keys(services).some(
    name => !INTERNAL_SERVICES.has(name) && services[name]?.id
  );
}
