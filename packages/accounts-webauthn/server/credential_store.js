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

export const credentialNotFound = () => {
  throw new Meteor.Error('webauthn-credential-not-found', 'Security key not found');
};

export const credentialInUse = () =>
  Accounts._handleError(
    'This security key is already registered',
    true,
    'webauthn-credential-in-use'
  );

export const getCredentials = user => user?.services?.webauthn?.credentials || [];

export const findCredential = (user, id) =>
  getCredentials(user).find(credential => credential.id === id);

// Mongo hands binary fields back as Uint8Array; a BSON Binary exposes its
// bytes as `buffer`.
const toUint8Array = value =>
  value instanceof Uint8Array ? value : new Uint8Array(value.buffer);

// The shape @simplewebauthn/server expects for verification.
export const toLibCredential = credential => ({
  id: credential.id,
  publicKey: toUint8Array(credential.publicKey),
  counter: credential.counter,
  transports: credential.transports,
});

// The document stored under services.webauthn.credentials.
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

// What the client is allowed to see: everything except the public key and
// the verification internals.
export const publicCredentialView = ({
  publicKey,
  counter,
  fmt,
  userVerified,
  ...view
}) => view;

// Signature counters must increase on every use. Authenticators that do not
// implement a counter report 0 forever, which is the only allowed repeat.
export function detectCounterRollback(storedCounter, newCounter) {
  if (newCounter === 0 && storedCounter === 0) {
    return false;
  }
  return newCounter <= storedCounter;
}

export async function touchCredential(userId, credentialId, authenticationInfo) {
  await Meteor.users.updateAsync(
    { _id: userId, 'services.webauthn.credentials.id': credentialId },
    {
      $set: {
        'services.webauthn.credentials.$.counter': authenticationInfo.newCounter,
        'services.webauthn.credentials.$.backedUp':
          authenticationInfo.credentialBackedUp,
        'services.webauthn.credentials.$.lastUsedAt': new Date(),
      },
    }
  );
}

const isDuplicateKeyError = error =>
  error?.code === 11000 || /E11000/.test(error?.errmsg || error?.message || '');

// Credential ids are globally unique; the unique index is the backstop and
// this check gives a clear error before the ceremony result is discarded.
export async function assertCredentialIdAvailable(credentialId) {
  const owner = await Meteor.users.findOneAsync(
    { 'services.webauthn.credentials.id': credentialId },
    { fields: { _id: 1 } }
  );
  if (owner) {
    credentialInUse();
  }
}

export async function addCredentialToUser(userId, credentialDoc) {
  try {
    const updated = await Meteor.users.updateAsync(
      { _id: userId },
      { $push: { 'services.webauthn.credentials': credentialDoc } }
    );
    if (!updated) {
      Accounts._handleError('User not found');
    }
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      credentialInUse();
    }
    throw error;
  }
}

// Removes one credential. Unless the account can log in another way, the
// removal only happens while a second credential remains; that condition is
// part of the update itself, so concurrent removals cannot strip the last
// credential. Returns false when nothing was removed.
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

// Whether the user could still log in without any WebAuthn credential: a
// password, an email address usable with accounts-passwordless, or an
// external (OAuth) service.
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
