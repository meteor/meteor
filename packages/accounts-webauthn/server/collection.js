import { Mongo } from 'meteor/mongo';
import { Accounts } from 'meteor/accounts-base';

// Pending WebAuthn challenges. The challenge string is the document id, which
// makes consuming a challenge a single atomic delete. Documents expire through
// the TTL index on `expiresAt`; expiry is also checked explicitly because the
// TTL monitor only runs periodically.
export const WebAuthnChallenges = new Mongo.Collection(
  'meteor_accounts_webauthnChallenges',
  { _preventAutopublish: true }
);

// Exposed for tests and for apps that need to inspect pending challenges.
Accounts._webAuthnChallenges = WebAuthnChallenges;

export async function setupChallengesCollection() {
  await WebAuthnChallenges.createIndexAsync('expiresAt', {
    expireAfterSeconds: 0,
  });
  await WebAuthnChallenges.createIndexAsync('userId', { sparse: true });
}

export async function storeChallenge({
  challenge,
  type,
  mode,
  userId = null,
  timeout,
  ...extra
}) {
  const createdAt = new Date();
  await WebAuthnChallenges.insertAsync({
    _id: challenge,
    type,
    mode,
    userId,
    ...extra,
    createdAt,
    expiresAt: new Date(createdAt.getTime() + timeout),
  });
}

// Atomically removes and returns the challenge document, or null when it does
// not exist, has expired, or was issued for a different ceremony. A challenge
// is consumed whether or not the verification that follows succeeds.
export async function consumeChallenge(challenge, { type, mode }) {
  if (typeof challenge !== 'string' || !challenge) {
    return null;
  }
  const doc = await WebAuthnChallenges.rawCollection().findOneAndDelete({
    _id: challenge,
  });
  const valid =
    doc &&
    doc.expiresAt instanceof Date &&
    doc.expiresAt > new Date() &&
    doc.type === type &&
    doc.mode === mode;
  return valid ? doc : null;
}
