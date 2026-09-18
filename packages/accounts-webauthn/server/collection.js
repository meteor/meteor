import { randomBytes } from 'crypto';
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

// The secret behind the decoy credential ids is stored in this collection
// under a fixed id, so every server process derives the same decoys and they
// survive restarts. The document has no `expiresAt`, so the TTL index leaves
// it alone, and its `type` keeps consumeChallenge() from matching it.
const DECOY_SECRET_ID = 'decoySecret';
let decoySecret;

/**
 * The cluster-wide secret behind the decoy credential ids, created on first
 * use with an atomic upsert and cached for the life of the process.
 * @returns {Promise<Buffer>}
 */
export async function getDecoySecret() {
  if (!decoySecret) {
    const selector = { _id: DECOY_SECRET_ID };
    try {
      // The upsert is the atomic step; $setOnInsert leaves an existing secret
      // alone, so every process ends up reading the same one.
      await WebAuthnChallenges.upsertAsync(selector, {
        $setOnInsert: {
          type: DECOY_SECRET_ID,
          secret: randomBytes(32).toString('hex'),
        },
      });
    } catch (error) {
      // Two processes raced to create it and the other one won.
      if (!(error?.code === 11000 || /E11000/.test(error?.message || ''))) {
        throw error;
      }
    }
    const doc = await WebAuthnChallenges.findOneAsync(selector);
    decoySecret = Buffer.from(doc.secret, 'hex');
  }
  return decoySecret;
}

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
 * @param {Boolean} [options.bound] Whether a selector was supplied, so the binding is enforced even when it matched nobody.
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
 * Removes and returns the challenge document, or `null` when it does not
 * exist, has expired, or was issued for a different ceremony. A challenge is
 * consumed whether or not the verification that follows succeeds. The delete
 * is the atomic step: of two concurrent submissions of the same challenge,
 * only one removes the document and gets to use it. Only a document of the
 * expected ceremony type is matched, which keeps the decoy secret out of reach
 * of a crafted challenge string.
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
  const selector = { _id: challenge, type };
  const doc = await WebAuthnChallenges.findOneAsync(selector);
  if (!doc || !(await WebAuthnChallenges.removeAsync(selector))) {
    return null;
  }
  const valid =
    doc.expiresAt instanceof Date && doc.expiresAt > new Date() && doc.mode === mode;
  return valid ? doc : null;
}
