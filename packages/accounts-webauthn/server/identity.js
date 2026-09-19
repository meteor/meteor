import { randomBytes } from 'crypto';
import { Meteor } from 'meteor/meteor';

/**
 * Creates a WebAuthn user handle: what an authenticator stores alongside a
 * discoverable credential and returns during usernameless login. It must be
 * stable, random, and free of personal data.
 * @returns {String} 32 random bytes, base64url encoded.
 */
export const generateUserHandle = () => randomBytes(32).toString('base64url');

/**
 * Decodes a user handle to the bytes the library expects.
 * @param {String} userHandle
 * @returns {Uint8Array}
 */
export const userHandleToBytes = userHandle =>
  new Uint8Array(Buffer.from(userHandle, 'base64url'));

/**
 * Returns the user's handle, provisioning one on first use. Users created
 * before this package was added get a handle the first time they register a
 * credential; the conditional update keeps concurrent registrations from
 * overwriting the handle of one another.
 * @param {Object} user The user document.
 * @returns {Promise<String>} The user handle.
 */
export async function ensureUserHandle(user) {
  const existing = user.services?.webauthn?.userHandle;
  if (existing) {
    return existing;
  }

  const userHandle = generateUserHandle();
  const updated = await Meteor.users.updateAsync(
    { _id: user._id, 'services.webauthn.userHandle': { $exists: false } },
    { $set: { 'services.webauthn.userHandle': userHandle } }
  );
  if (updated) {
    return userHandle;
  }

  const fresh = await Meteor.users.findOneAsync(user._id, {
    fields: { 'services.webauthn.userHandle': 1 },
  });
  const handle = fresh?.services?.webauthn?.userHandle;
  if (!handle) {
    throw new Meteor.Error(500, 'Could not provision a WebAuthn user handle');
  }
  return handle;
}
