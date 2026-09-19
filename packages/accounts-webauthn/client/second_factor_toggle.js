import { Accounts } from 'meteor/accounts-base';
import { callMethod, withCallback } from './util.js';

/**
 * @summary Require a security key whenever the logged-in user logs in. Returns a Promise.
 * @locus Client
 * @returns {Promise<void>}
 * @importFromPackage accounts-base
 */
Accounts.enableWebAuthnSecondFactorAsync = () =>
  callMethod('enableWebAuthnSecondFactor');

/**
 * @summary Require a security key, in addition to the password or login
 * token, whenever the logged-in user logs in. At least one key must be
 * registered.
 * @locus Client
 * @param {Function} [callback] Optional callback. Called with `(error, result)`: `error` is set on failure, and `result` is `undefined` on success.
 * @importFromPackage accounts-base
 */
Accounts.enableWebAuthnSecondFactor = withCallback(
  Accounts.enableWebAuthnSecondFactorAsync
);

/**
 * @summary Stop requiring a security key when the logged-in user logs in. Returns a Promise.
 * @locus Client
 * @returns {Promise<void>}
 * @importFromPackage accounts-base
 */
Accounts.disableWebAuthnSecondFactorAsync = () =>
  callMethod('disableWebAuthnSecondFactor');

/**
 * @summary Stop requiring a security key when the logged-in user logs in.
 * Registered keys are kept and can still be used for passwordless login.
 * @locus Client
 * @param {Function} [callback] Optional callback. Called with `(error, result)`: `error` is set on failure, and `result` is `undefined` on success.
 * @importFromPackage accounts-base
 */
Accounts.disableWebAuthnSecondFactor = withCallback(
  Accounts.disableWebAuthnSecondFactorAsync
);

/**
 * @summary Whether the logged-in user must present a security key when logging in. Returns a Promise.
 * @locus Client
 * @returns {Promise<Boolean>}
 * @importFromPackage accounts-base
 */
Accounts.hasWebAuthnSecondFactorEnabledAsync = () =>
  callMethod('hasWebAuthnSecondFactorEnabled');

/**
 * @summary Whether the logged-in user must present a security key when logging in.
 * @locus Client
 * @param {Function} callback Called with `(error, enabled)`: `error` is set on failure, otherwise `enabled` is a boolean.
 * @importFromPackage accounts-base
 */
Accounts.hasWebAuthnSecondFactorEnabled = withCallback(
  Accounts.hasWebAuthnSecondFactorEnabledAsync
);
