import { Meteor } from 'meteor/meteor';
import { transformSelector, withCallback } from './util.js';
import { requestAssertion, callLoginMethod } from './orchestration.js';

/**
 * @summary Log the user in with a security key or passkey. Returns a Promise.
 * Without a selector the authenticator identifies the account through a
 * discoverable credential; with a selector, the keys registered for that
 * account are requested.
 * @locus Client
 * @param {Object | String} [selector]
 *   Either a string interpreted as a username or an email; or an object with a
 *   single key: `email`, `username` or `id`.
 * @returns {Promise<Object>} Resolves with login details on success, rejects with error on failure.
 * @importFromPackage meteor
 */
Meteor.loginWithWebAuthnAsync = async selector => {
  const webauthn = await requestAssertion({
    selector: transformSelector(selector),
    mode: 'login',
  });
  return callLoginMethod([{ webauthn }]);
};

/**
 * @summary Log the user in with a security key or passkey. Without a
 * selector the authenticator identifies the account through a discoverable
 * credential; with a selector, the keys registered for that account are
 * requested.
 * @locus Client
 * @param {Object | String} [selector]
 *   Either a string interpreted as a username or an email; or an object with a
 *   single key: `email`, `username` or `id`.
 * @param {Function} [callback] Optional callback.
 *   Called with no arguments on success, or with a single `Error` argument
 *   on failure.
 * @importFromPackage meteor
 */
Meteor.loginWithWebAuthn = withCallback(Meteor.loginWithWebAuthnAsync);
