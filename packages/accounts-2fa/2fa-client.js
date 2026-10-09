import { Accounts } from 'meteor/accounts-base';

// Used in the various functions below to handle errors consistently
const reportError = (error, callback) => {
  if (callback) {
    callback(error);
  } else {
    throw error;
  }
};

/**
 * @summary Verify if the logged user has 2FA enabled
 * @locus Client
 * @param {Function} [callback] Called with a boolean on success that indicates whether the user has
 *    or not 2FA enabled, or with a single `Error` argument on failure.
 */
Accounts.has2faEnabled = callback => {
  Accounts.connection.call('has2faEnabled', callback);
};

/**
 * @summary Generates a svg QR code and save secret on user
 * @locus Client
 * @param {String} appName It's the name of your app that will show up when the user scans the QR code.
 * @param {Function} callback
 *   Called with a single `Error` argument on failure.
 *   Or, on success, called with an object containing the QR code in SVG format (svg),
 *   the QR secret (secret), and the URI so the user can manually activate the 2FA without reading the QR code (uri).
 */
Accounts.generate2faActivationQrCode = (appName, callback) => {
  if (!appName) {
    throw new Meteor.Error(
      500,
      'An app name is necessary when calling the function generate2faActivationQrCode'
    );
  }

  if (!callback) {
    throw new Meteor.Error(
      500,
      'A callback is necessary when calling the function generate2faActivationQrCode so a QR code can be provided'
    );
  }

  Accounts.connection.call('generate2faActivationQrCode', appName, callback);
};

/**
 * @summary Enable the user 2FA
 * @locus Client
 * @param {String} code Code received from the authenticator app.
 * @param {Function} [callback] Optional callback.
 *   Called with no arguments on success, or with a single `Error` argument
 *   on failure.
 */
Accounts.enableUser2fa = (code, callback) => {
  if (!code) {
    return reportError(
      new Meteor.Error(400, 'Must provide a code to validate'),
      callback
    );
  }
  Accounts.connection.call('enableUser2fa', code, callback);
};

let contextProvider = null;

/**
 * @summary Provide data sent with every login so the server policy can read it.
 * The DDP connection does not forward cookies, so a trusted-browser token has to travel here.
 * Values must be strings. Non-string values are dropped. The server treats an invalid context as absent.
 * @locus Client
 * @param {Function} fn Returns an object such as `{ trustedDeviceToken }`.
 */
Accounts.set2faContextProvider = fn => {
  contextProvider = fn;
};

Accounts._get2faClientContext = () => {
  if (typeof contextProvider !== 'function') {
    return undefined;
  }
  try {
    const value = contextProvider();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return undefined;
    }
    const stringsOnly = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'string') {
        stringsOnly[key] = entry;
      }
    }
    if (!Object.keys(stringsOnly).length) {
      return undefined;
    }
    return stringsOnly;
  } catch (error) {
    return undefined;
  }
};

const selectorForLogin = selector => {
  if (typeof selector !== 'string') {
    return selector;
  }
  return selector.includes('@') ? { email: selector } : { username: selector };
};

/**
 * @summary Ask the server to email a second-factor code, after the password has been checked.
 * The callback receives the `no-2fa-code` error when the message was sent or is still on cooldown.
 * Requires `accounts-password`.
 * @locus Client
 * @param {Object|String} selector
 * @param {String} password
 * @param {Function} [callback]
 */
Accounts.request2faEmailCode = (selector, password, callback) => {
  if (typeof Accounts._hashPassword !== 'function') {
    return reportError(
      new Meteor.Error(400, 'accounts-password is required to request a 2FA email code'),
      callback
    );
  }
  const loginOptions = {
    user: selectorForLogin(selector),
    password: Accounts._hashPassword(password),
    twoFactorMethod: 'email',
  };
  const clientContext = Accounts._get2faClientContext();
  if (clientContext && Object.keys(clientContext).length) {
    loginOptions.twoFactorContext = clientContext;
  }
  Accounts.callLoginMethod({
    methodArguments: [loginOptions],
    userCallback: error => {
      if (error && error.error !== 'no-2fa-code') {
        reportError(error, callback);
        return;
      }
      if (callback) {
        callback(error);
      }
    },
  });
};

/**
 * @summary Disable user 2FA
 * @locus Client
 * @param {Function} [callback] Optional callback.
 *   Called with no arguments on success, or with a single `Error` argument
 *   on failure.
 */
Accounts.disableUser2fa = callback => {
  Accounts.connection.call('disableUser2fa', callback);
};
