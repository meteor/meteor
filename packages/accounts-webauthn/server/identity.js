import { randomBytes } from 'crypto';
import { Meteor } from 'meteor/meteor';

// The WebAuthn user handle is what an authenticator stores alongside a
// discoverable credential and returns during usernameless login. It must be
// stable, random, and free of personal data.
export const generateUserHandle = () => randomBytes(32).toString('base64url');

export const userHandleToBytes = userHandle =>
  new Uint8Array(Buffer.from(userHandle, 'base64url'));

// Users created before this package was added get a handle the first time they
// register a credential. The conditional update keeps concurrent registrations
// from overwriting the handle of one another.
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
