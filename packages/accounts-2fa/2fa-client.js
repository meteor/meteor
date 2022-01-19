import { Accounts } from "meteor/accounts-base";

// Used in the various functions below to handle errors consistently
const reportError = (error, callback) => {
  if (callback) {
    callback(error);
  } else {
    throw error;
  }
};

/**
 * @summary Verify if the user has 2FA enabled
 * @locus Client
 * @param {Object|String} selector Username, email or custom selector to identify the user.
 * @param {Function} [callback] Optional callback. Called with a boolean on success that indicates whether the user has
 *    or not 2FA enabled, or with a single `Error` argument on failure.
 */
Accounts.has2faEnabled = (selector, callback) => {
  Accounts.connection.call(
    'has2faEnabled',
    selector,
    callback,
  );
};

/**
 * @summary Generates a svg QR code and save secret on user
 * @locus Client
 * @param {String} appName Optional. It's the name of your app that will show up when the user scans the QR code.
 * @param {Function} [callback] Optional callback.
 *   Called with no arguments on success, or with a single `Error` argument
 *   on failure.
 */
Accounts.generate2faActivationQrCode = (appName, callback) => {
  let cb = callback;
  if (typeof appName === "function") {
    cb = appName;
  }
  Accounts.connection.call(
    'generate2faActivationQrCode',
    appName,
    cb,
  );
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
    return reportError(new Meteor.Error(400, 'Must provide a code to validate'), callback);
  }
  Accounts.connection.call(
    'enableUser2fa',
    code,
    callback,
  );
};

/**
 * @summary Disable user 2FA
 * @locus Client
 * @param {Function} [callback] Optional callback.
 *   Called with no arguments on success, or with a single `Error` argument
 *   on failure.
 */
Accounts.disableUser2fa = callback => {
  Accounts.connection.call(
    'disableUser2fa',
    callback,
  );
};
