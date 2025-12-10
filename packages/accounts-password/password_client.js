// Used in the various functions below to handle errors consistently
const reportError = (error, callback) => {
   if (callback) {
     callback(error);
   } else {
     throw error;
   }
};

const internalLoginWithPassword = ({ selector, password, code, callback }) => {
  if (typeof selector === 'string')
    if (!selector.includes('@')) selector = { username: selector };
    else selector = { email: selector };
  Accounts.callLoginMethod({
    methodArguments: [
      {
        user: selector,
        password: Accounts._hashPassword(password),
        code,
      },
    ],
    userCallback: (error, result) => {
      if (error) {
        reportError(error, callback);
      } else {
        callback && callback(error, result);
      }
    },
  });
  return selector;
};

// Attempt to log in with a password.
//
// @param selector {String|Object} One of the following:
//   - {username: (username)}
//   - {email: (email)}
//   - a string which may be a username or email, depending on whether
//     it contains "@".
// @param password {String}
// @param callback {Function(error|undefined)}

/**
 * @summary Log the user in with a password.
 * @locus Client
 * @param {Object | String} selector
 *   Either a string interpreted as a username or an email; or an object with a
 *   single key: `email`, `username` or `id`. Username or email match in a case
 *   insensitive manner.
 * @param {String} password The user's password.
 * @param {Function} [callback] Optional callback.
 *   Called with no arguments on success, or with a single `Error` argument
 *   on failure.
 * @importFromPackage meteor
 */
Meteor.loginWithPassword = (selector, password, callback) => {
  return internalLoginWithPassword({ selector, password, callback });
};

Accounts._hashPassword = password => ({
  digest: SHA256(password),
  algorithm: "sha-256"
});


/**
 * @summary Log the user in with a password and token.
 * @locus Client
 * @param {Object | String} selector
 *   Either a string interpreted as a username or an email; or an object with a
 *   single key: `email`, `username` or `id`. Username or email match in a case
 *   insensitive manner.
 * @param {String} password The user's password.
 * @param {String} token Token provide by the user's authenticator app.
 * @param {Function} [callback] Optional callback.
 *   Called with no arguments on success, or with a single `Error` argument
 *   on failure.
 * @importFromPackage meteor
 */

Meteor.loginWithPasswordAnd2faCode = (selector, password, code, callback) => {
  if (code == null || typeof code !== 'string' || !code) {
    throw new Meteor.Error(
      400,
      'token is required to use loginWithPasswordAnd2faCode and must be a string'
    );
  }
  return internalLoginWithPassword({ selector, password, code, callback });
};


// Attempt to log in as a new user.

/**
 * @summary Create a new user.
 * @locus Anywhere
 * @param {Object} options
 * @param {String} options.username A unique name for this user.
 * @param {String} options.email The user's email address.
 * @param {String} options.password The user's password. This is __not__ sent in plain text over the wire.
 * @param {Object} options.profile The user's profile, typically including the `name` field.
 * @param {Function} [callback] Client only, optional callback. Called with no arguments on success, or with a single `Error` argument on failure.
 * @importFromPackage accounts-base
 */
Accounts.createUser = (options, callback) => {
  options = { ...options }; // we'll be modifying options

  if (typeof options.password !== 'string')
    throw new Error("options.password must be a string");
  if (!options.password) {
    return reportError(new Meteor.Error(400, "Password may not be empty"), callback);
  }

  // Replace password with the hashed password.
  options.password = Accounts._hashPassword(options.password);

  Accounts.callLoginMethod({
    methodName: 'createUser',
    methodArguments: [options],
    userCallback: callback
  });
};


/**
 * @summary Create a new user and returns a promise of its result.
 * @locus Anywhere
 * @param {Object} options
 * @param {String} options.username A unique name for this user.
 * @param {String} options.email The user's email address.
 * @param {String} options.password The user's password. This is __not__ sent in plain text over the wire.
 * @param {Object} options.profile The user's profile, typically including the `name` field.
 * @importFromPackage accounts-base
 */
Accounts.createUserAsync = (options) => {
  return new Promise((resolve, reject) =>
    Accounts.createUser(options, (e) => {
      if (e) {
        reject(e);
      } else {
        resolve();
      }
    })
  );
};

// Change password. Must be logged in.
//
// @param oldPassword {String|null} By default servers no longer allow
//   changing password without the old password, but they could so we
//   support passing no password to the server and letting it decide.
// @param newPassword {String}
// @param callback {Function(error|undefined)}

/**
 * @summary Change the current user's password. Must be logged in.
 * @locus Client
 * @param {String} oldPassword The user's current password. This is __not__ sent in plain text over the wire.
 * @param {String} newPassword A new password for the user. This is __not__ sent in plain text over the wire.
 * @param {Function} [callback] Optional callback. Called with no arguments on success, or with a single `Error` argument on failure.
 * @importFromPackage accounts-base
 */
Accounts.changePassword = (oldPassword, newPassword, callback) => {
  if (!Meteor.user()) {
    return reportError(new Error("Must be logged in to change password."), callback);
  }

  if (!(typeof newPassword === "string" || newPassword instanceof String)) {
    return reportError(new Meteor.Error(400, "Password must be a string"), callback);
  }

  if (!newPassword) {
    return reportError(new Meteor.Error(400, "Password may not be empty"), callback);
  }

  Accounts.connection.apply(
    'changePassword',
    [oldPassword ? Accounts._hashPassword(oldPassword) : null,
     Accounts._hashPassword(newPassword)],
    (error, result) => {
    if (error || !result) {
        // A normal error, not an error telling us to upgrade to bcrypt
        reportError(
          error || new Error("No result from changePassword."), callback);
      } else {
        callback && callback();
      }
    }
  );
};

// Sends an email to a user with a link that can be used to reset
// their password
//
// @param options {Object}
//   - email: (email)
// @param callback (optional) {Function(error|undefined)}

/**
 * @summary Request a forgot password email.
 * @locus Client
 * @param {Object} options
 * @param {String} options.email The email address to send a password reset link.
 * @param {Function} [callback] Optional callback. Called with no arguments on success, or with a single `Error` argument on failure.
 * @importFromPackage accounts-base
 */
Accounts.forgotPassword = (options, callback) => {
  if (!options.email) {
    return reportError(new Meteor.Error(400, "Must pass options.email"), callback);
  }

  if (callback) {
    Accounts.connection.call("forgotPassword", options, callback);
  } else {
    Accounts.connection.call("forgotPassword", options);
  }
};

// Resets a password based on a token originally created by
// Accounts.forgotPassword, and then logs in the matching user.
//
// @param token {String}
// @param newPassword {String}
// @param callback (optional) {Function(error|undefined)}

/**
 * @summary Reset the password for a user using a token received in email. Logs the user in afterwards if the user doesn't have 2FA enabled.
 * @locus Client
 * @param {String} token The token retrieved from the reset password URL.
 * @param {String} newPassword A new password for the user. This is __not__ sent in plain text over the wire.
 * @param {Function} [callback] Optional callback. Called with no arguments on success, or with a single `Error` argument on failure.
 * @importFromPackage accounts-base
 */
Accounts.resetPassword = (token, newPassword, callback) => {
  if (!(typeof token === "string" || token instanceof String)) {
    return reportError(new Meteor.Error(400, "Token must be a string"), callback);
  }

  if (!(typeof newPassword === "string" || newPassword instanceof String)) {
    return reportError(new Meteor.Error(400, "Password must be a string"), callback);
  }

  if (!newPassword) {
    return reportError(new Meteor.Error(400, "Password may not be empty"), callback);
  }

  Accounts.callLoginMethod({
    methodName: 'resetPassword',
    methodArguments: [token, Accounts._hashPassword(newPassword)],
    userCallback: callback});
};

// Verifies a user's email address based on a token originally
// created by Accounts.sendVerificationEmail
//
// @param token {String}
// @param callback (optional) {Function(error|undefined)}

/**
 * @summary Marks the user's email address as verified. Logs the user in afterwards if the user doesn't have 2FA enabled.
 * @locus Client
 * @param {String} token The token retrieved from the verification URL.
 * @param {Function} [callback] Optional callback. Called with no arguments on success, or with a single `Error` argument on failure.
 * @importFromPackage accounts-base
 */
Accounts.verifyEmail = (token, callback) => {
  if (!token) {
    return reportError(new Meteor.Error(400, "Need to pass token"), callback);
  }

  Accounts.callLoginMethod({
    methodName: 'verifyEmail',
    methodArguments: [token],
    userCallback: callback});
};
