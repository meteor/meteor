import { createHmac, timingSafeEqual } from 'crypto';
import { getDecoySecret } from './collection.js';

// Shapes a decoy list can take. Real keys report ids of 16 to 64 bytes,
// transports that depend on the authenticator model (sometimes none), and
// lists of any length, so a decoy must not have one telltale form.
const DECOY_ID_LENGTHS = [16, 20, 32, 64];
const DECOY_TRANSPORTS = [['internal', 'hybrid'], ['usb'], ['usb', 'nfc'], ['internal'], []];
const TAG_LENGTH = 8;

/**
 * Keyed hash of the given parts.
 * @param {String} algorithm `sha256` or `sha512`.
 * @param {Buffer} secret
 * @param {...(String|Buffer)} parts
 * @returns {Buffer}
 */
const hmac = (algorithm, secret, ...parts) => {
  const mac = createHmac(algorithm, secret);
  for (const part of parts) {
    mac.update(part);
  }
  return mac.digest();
};

/**
 * Builds a decoy credential id: random-looking bytes followed by a tag that
 * authenticates them with the shared secret. The tag lets the registration
 * path recognize a decoy and refuse it exactly like a taken id, so probing an
 * id through registration reveals nothing.
 * @param {Buffer} secret
 * @param {Buffer} seed The per-selector seed.
 * @param {Number} index Position in the decoy list.
 * @param {Number} length Total id length in bytes.
 * @returns {Buffer}
 */
const decoyId = (secret, seed, index, length) => {
  const body = hmac('sha512', secret, 'decoy-id', seed, String(index)).subarray(
    0,
    length - TAG_LENGTH
  );
  const tag = hmac('sha256', secret, 'decoy-tag', body).subarray(0, TAG_LENGTH);
  return Buffer.concat([body, tag]);
};

/**
 * Builds the decoy list a selector receives when it resolves to no
 * credentials, so the response does not reveal whether the account exists or
 * has keys (WebAuthn Level 3, section 14.6.3). Count, id lengths and
 * transports all derive from a keyed hash of the selector, so the list is as
 * stable as a real one but has no fixed shape. The secret is shared by every
 * server process and survives restarts.
 * @param {Object} selector `{ id }`, `{ username }` or `{ email }`.
 * @returns {Promise<Array>} One to three credential descriptors.
 */
export async function decoyCredentials(selector) {
  const [field, value] = Object.entries(selector)[0];
  const secret = await getDecoySecret();
  const seed = hmac('sha256', secret, 'decoy-seed', `${field}:${String(value).toLowerCase()}`);
  return Array.from({ length: 1 + (seed[0] % 3) }, (_, index) => {
    const length = DECOY_ID_LENGTHS[seed[1 + index] % DECOY_ID_LENGTHS.length];
    return {
      id: decoyId(secret, seed, index, length).toString('base64url'),
      transports: DECOY_TRANSPORTS[seed[4 + index] % DECOY_TRANSPORTS.length],
    };
  });
}

/**
 * Whether a credential id is one of our decoys, that is, whether its tag
 * verifies with the shared secret. A genuine id matches by chance with
 * probability 2^-64.
 * @param {String} credentialId The base64url id.
 * @returns {Promise<Boolean>}
 */
export async function isDecoyCredentialId(credentialId) {
  const bytes = Buffer.from(credentialId, 'base64url');
  if (bytes.length <= TAG_LENGTH) {
    return false;
  }
  const body = bytes.subarray(0, bytes.length - TAG_LENGTH);
  const tag = bytes.subarray(bytes.length - TAG_LENGTH);
  const expected = hmac('sha256', await getDecoySecret(), 'decoy-tag', body).subarray(
    0,
    TAG_LENGTH
  );
  return timingSafeEqual(tag, expected);
}
