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

/**
 * Creates the TTL index that expires challenges and the index used to look
 * them up by user.
 * @returns {Promise<void>}
 */
export async function setupChallengesCollection() {
  await WebAuthnChallenges.createIndexAsync('expiresAt', {
    expireAfterSeconds: 0,
  });
  await WebAuthnChallenges.createIndexAsync('userId', { sparse: true });
}

/**
 * Stores a pending challenge, keyed by the challenge string.
 * @param {Object} options
 * @param {String} options.challenge The base64url challenge.
 * @param {String} options.type `registration` or `authentication`.
 * @param {String} options.mode The ceremony mode.
 * @param {String} [options.userId] The user the challenge is bound to.
 * @param {Number} options.timeout Lifetime in milliseconds.
 * @param {...*} [options.extra] Any other field is stored with the challenge, such as the pending sign-up data.
 * @returns {Promise<void>}
 */
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

/**
 * Atomically removes and returns the challenge document, or `null` when it
 * does not exist, has expired, or was issued for a different ceremony. A
 * challenge is consumed whether or not the verification that follows succeeds.
 * @param {String} challenge The base64url challenge.
 * @param {Object} options
 * @param {String} options.type `registration` or `authentication`.
 * @param {String} options.mode The ceremony mode the challenge must have been issued for.
 * @returns {Promise<Object|null>} The challenge document, or `null`.
 */
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
