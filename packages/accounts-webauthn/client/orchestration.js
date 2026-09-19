import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
} from '@simplewebauthn/browser';
import { callMethod } from './util.js';
import { normalizeWebAuthnError } from './errors.js';

/**
 * Fetches ceremony options from the server and runs the browser ceremony.
 * @param {String} optionsMethod The server method that issues the options.
 * @param {Object} args The argument passed to that method.
 * @param {Function} start `startRegistration` or `startAuthentication`.
 * @returns {Promise<Object>} The browser's response JSON.
 * @throws {Meteor.Error} `webauthn-not-supported`, or a normalized ceremony error.
 */
async function runCeremony(optionsMethod, args, start) {
  if (!browserSupportsWebAuthn()) {
    throw new Meteor.Error(
      'webauthn-not-supported',
      'This browser does not support WebAuthn.'
    );
  }
  const optionsJSON = await callMethod(optionsMethod, args);
  try {
    return await start({ optionsJSON });
  } catch (error) {
    throw normalizeWebAuthnError(error);
  }
}

/**
 * Runs an authentication ceremony. Shared by primary login and the
 * second-factor login variants.
 * @param {Object} options
 * @param {Object} [options.selector] The user selector, when known.
 * @param {String} options.mode `login` or `secondFactor`.
 * @returns {Promise<Object>} The authentication response JSON.
 */
export const requestAssertion = ({ selector, mode }) =>
  runCeremony(
    'generateWebAuthnAuthenticationOptions',
    { selector, mode },
    startAuthentication
  );

/**
 * Runs a registration ceremony. Shared by `registerWebAuthnCredential` and
 * `createUserWithWebAuthn`.
 * @param {Object} options
 * @param {String} options.mode `addCredential` or `signup`.
 * @param {String} [options.name] A label for the key.
 * @param {Object} [options.userData] The new account's data for `signup`.
 * @returns {Promise<Object>} The registration response JSON.
 */
export const requestRegistration = ({ mode, name, userData }) =>
  runCeremony(
    'generateWebAuthnRegistrationOptions',
    { mode, name, userData },
    startRegistration
  );

/**
 * Calls a login method through `Accounts.callLoginMethod` and resolves with
 * the login details.
 * @param {Array} methodArguments The arguments of the login method.
 * @param {String} [methodName='login']
 * @returns {Promise<Object>}
 */
export const callLoginMethod = (methodArguments, methodName = 'login') =>
  new Promise((resolve, reject) => {
    Accounts.callLoginMethod({
      methodName,
      methodArguments,
      userCallback: (error, loginDetails) =>
        error ? reject(error) : resolve(loginDetails),
    });
  });
