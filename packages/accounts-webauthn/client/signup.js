import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { withCallback } from './util.js';
import { requestRegistration, callLoginMethod } from './orchestration.js';

/**
 * @summary Create a new user whose only login method is a security key or
 * passkey, and log them in. Returns a Promise.
 * @locus Client
 * @param {Object} options
 * @param {String} [options.username] A unique name for this user. Required when `email` is absent.
 * @param {String} [options.email] The user's email address. Required when `username` is absent.
 * @param {Object} options.profile The user's profile, typically including the `name` field.
 * @param {String} options.credentialName A label for the security key.
 * @returns {Promise<Object>} Resolves with login details on success, rejects with error on failure.
 * @importFromPackage accounts-base
 */
Accounts.createUserWithWebAuthnAsync = async (options = {}) => {
  const { username, email, profile, credentialName } = options;
  if (!username && !email) {
    throw new Meteor.Error(400, 'Need to set a username or email');
  }
  const credential = await requestRegistration({
    mode: 'signup',
    name: credentialName,
    userData: { username, email, profile },
  });
  return callLoginMethod(
    [{ credential, credentialName }],
    'createUserWithWebAuthn'
  );
};

/**
 * @summary Create a new user whose only login method is a security key or
 * passkey, and log them in.
 * @locus Client
 * @param {Object} options
 * @param {String} [options.username] A unique name for this user. Required when `email` is absent.
 * @param {String} [options.email] The user's email address. Required when `username` is absent.
 * @param {Object} options.profile The user's profile, typically including the `name` field.
 * @param {String} options.credentialName A label for the security key.
 * @param {Function} [callback] Optional callback. Called with `(error, loginDetails)`: `error` is set on failure, otherwise `loginDetails` is the result of the login.
 * @importFromPackage accounts-base
 */
Accounts.createUserWithWebAuthn = withCallback(
  Accounts.createUserWithWebAuthnAsync
);
