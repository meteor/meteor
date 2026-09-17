import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { callMethod, withCallback } from './util.js';
import { requestRegistration } from './orchestration.js';

/**
 * Rejects a missing or empty credential id before calling the server.
 * @param {String} id
 * @throws {Meteor.Error} 400
 */
const requireCredentialId = id => {
  if (typeof id !== 'string' || !id) {
    throw new Meteor.Error(400, 'Must provide a credential id');
  }
};

/**
 * @summary Register a new security key or passkey for the logged-in user. Returns a Promise.
 * @locus Client
 * @param {Object | String} [options] A label for the key, or an object with a `name` field.
 * @returns {Promise<Object>} Resolves with the stored key description (`id`, `name`,
 *   `transports`, `deviceType`, `backedUp`, `aaguid`, `createdAt`, `lastUsedAt`).
 * @importFromPackage accounts-base
 */
Accounts.registerWebAuthnCredentialAsync = async options => {
  const name = typeof options === 'string' ? options : options?.name;
  if (name !== undefined && (typeof name !== 'string' || !name)) {
    throw new Meteor.Error(400, 'Credential name must be a non-empty string');
  }
  const credential = await requestRegistration({ mode: 'addCredential', name });
  return callMethod('registerWebAuthnCredential', { credential, name });
};

/**
 * @summary Register a new security key or passkey for the logged-in user.
 * @locus Client
 * @param {Object | String} [options] A label for the key, or an object with a `name` field.
 * @param {Function} [callback] Optional callback. Called with `(error, credential)`, where
 *   `credential` describes the stored key (`id`, `name`, `transports`, `deviceType`,
 *   `backedUp`, `aaguid`, `createdAt`, `lastUsedAt`).
 * @importFromPackage accounts-base
 */
Accounts.registerWebAuthnCredential = withCallback(
  Accounts.registerWebAuthnCredentialAsync
);

/**
 * @summary List the security keys registered for the logged-in user. Returns a Promise.
 * @locus Client
 * @returns {Promise<Array>} Resolves with the list of credential descriptions.
 * @importFromPackage accounts-base
 */
Accounts.listWebAuthnCredentialsAsync = () => callMethod('listWebAuthnCredentials');

/**
 * @summary List the security keys registered for the logged-in user.
 * @locus Client
 * @param {Function} callback Called with `(error, credentials)`, where each credential has
 *   `id`, `name`, `transports`, `deviceType`, `backedUp`, `aaguid`, `createdAt` and `lastUsedAt`.
 * @importFromPackage accounts-base
 */
Accounts.listWebAuthnCredentials = withCallback(
  Accounts.listWebAuthnCredentialsAsync
);

/**
 * @summary Rename a security key of the logged-in user. Returns a Promise.
 * @locus Client
 * @param {String} id The credential id, as returned by `Accounts.listWebAuthnCredentials`.
 * @param {String} name The new label.
 * @returns {Promise<void>}
 * @importFromPackage accounts-base
 */
Accounts.renameWebAuthnCredentialAsync = async (id, name) => {
  requireCredentialId(id);
  if (typeof name !== 'string' || !name) {
    throw new Meteor.Error(400, 'Must provide a name');
  }
  await callMethod('renameWebAuthnCredential', id, name);
};

/**
 * @summary Rename a security key of the logged-in user.
 * @locus Client
 * @param {String} id The credential id, as returned by `Accounts.listWebAuthnCredentials`.
 * @param {String} name The new label.
 * @param {Function} [callback] Optional callback. Called with `(error, result)`: `error` is set on failure, and `result` is `undefined` on success.
 * @importFromPackage accounts-base
 */
Accounts.renameWebAuthnCredential = withCallback(
  Accounts.renameWebAuthnCredentialAsync
);

/**
 * @summary Remove a security key from the logged-in user. Returns a Promise.
 * Fails with the `webauthn-last-credential` error when it is the last key and
 * the account has no other way to log in.
 * @locus Client
 * @param {String} id The credential id, as returned by `Accounts.listWebAuthnCredentials`.
 * @returns {Promise<void>}
 * @importFromPackage accounts-base
 */
Accounts.removeWebAuthnCredentialAsync = async id => {
  requireCredentialId(id);
  await callMethod('removeWebAuthnCredential', id);
};

/**
 * @summary Remove a security key from the logged-in user. Fails with the
 * `webauthn-last-credential` error when it is the last key and the account has
 * no other way to log in.
 * @locus Client
 * @param {String} id The credential id, as returned by `Accounts.listWebAuthnCredentials`.
 * @param {Function} [callback] Optional callback. Called with `(error, result)`: `error` is set on failure, and `result` is `undefined` on success.
 * @importFromPackage accounts-base
 */
Accounts.removeWebAuthnCredential = withCallback(
  Accounts.removeWebAuthnCredentialAsync
);
