// By default, allow the autologin process to happen
autoLoginEnabled = true;

// All of the special hash URLs we support for accounts interactions
var accountsPaths = ["reset-password", "verify-email", "enroll-account"];

// Separate out this functionality for testing
var attemptToMatchHash = function (hash, success) {
  _.each(accountsPaths, function (urlPart) {
    var token;

    tokenRegex = new RegExp("^\\#\\/" + urlPart + "\\/(.*)$");
    match = hash.match(tokenRegex);

    if (match) {
      token = match[1];

      // XXX COMPAT WITH 0.9.3
      if (urlPart === "reset-password") {
        Accounts._resetPasswordToken = token;
      } else if (urlPart === "verify-email") {
        Accounts._verifyEmailToken = token;
      } else if (urlPart === "enroll-account") {
        Accounts._enrollAccountToken = token;
      }
    } else {
      return;
    }

    // Do some stuff with the token we matched
    success(token, urlPart);
  });
};

// We only support one callback per URL
var accountsCallbacks = {};

// The UI flow will call this when done to log in the existing person
var enableAutoLogin = function () {
  Accounts._enableAutoLogin();
};

// Actually call the function, has to happen in the top level so that we can
// mess with autoLoginEnabled.
attemptToMatchHash(window.location.hash, function (token, urlPart) {
  // put login in a suspended state to wait for the interaction to finish
  autoLoginEnabled = false;

  // reset the URL
  window.location.hash = "";

  // wait for other packages to register callbacks
  Meteor.startup(function () {
    // if a callback has been registered for this kind of token, call it
    if (accountsCallbacks[urlPart]) {
      accountsCallbacks[urlPart](token, enableAutoLogin);
    }
  });
});

// Export for testing
AccountsTest = {
  attemptToMatchHash: attemptToMatchHash
};

// XXX these should be moved to accounts-password eventually. Right now
// this is prevented by the need to set autoLoginEnabled=false, but in
// some bright future we won't need to do that anymore.

/**
 * @summary Register a function to call when a reset password link is clicked
 * in an email sent by
 * [`Accounts.sendResetPasswordEmail`](#accounts_sendresetpasswordemail).
 * This function should be called in top-level code, not inside
 * `Meteor.startup()`.
 * @param  {Function} callback The function to call. It is given two arguments:
 *
 * 1. `token`: A password reset token that can be passed to
 * [`Accounts.resetPassword`](#accounts_resetpassword).
 * 2. `done`: A function to call when the password reset UI flow is complete. The normal
 * login process is suspended until this function is called, so that the
 * password for user A can be reset even if user B was logged in.
 * @locus Client
 */
Accounts.onResetPasswordLink = function (callback) {
  if (accountsCallbacks["reset-password"]) {
    Meteor._debug("Accounts.onResetPasswordLink was called more than once. " +
      "Only one callback added will be executed.");
  }

  accountsCallbacks["reset-password"] = callback;
};

/**
 * @summary Register a function to call when an email verification link is
 * clicked in an email sent by
 * [`Accounts.sendVerificationEmail`](#accounts_sendverificationemail).
 * This function should be called in top-level code, not inside
 * `Meteor.startup()`.
 * @param  {Function} callback The function to call. It is given two arguments:
 *
 * 1. `token`: An email verification token that can be passed to
 * [`Accounts.verifyEmail`](#accounts_verifyemail).
 * 2. `done`: A function to call when the email verification UI flow is complete.
 * The normal login process is suspended until this function is called, so
 * that the user can be notified that they are verifying their email before
 * being logged in.
 * @locus Client
 */
Accounts.onEmailVerificationLink = function (callback) {
  if (accountsCallbacks["verify-email"]) {
    Meteor._debug("Accounts.onEmailVerificationLink was called more than once. " +
      "Only one callback added will be executed.");
  }

  accountsCallbacks["verify-email"] = callback;
};

/**
 * @summary Register a function to call when an account enrollment link is
 * clicked in an email sent by
 * [`Accounts.sendEnrollmentEmail`](#accounts_sendenrollmentemail).
 * This function should be called in top-level code, not inside
 * `Meteor.startup()`.
 * @param  {Function} callback The function to call. It is given two arguments:
 *
 * 1. `token`: A password reset token that can be passed to
 * [`Accounts.resetPassword`](#accounts_resetpassword) to give the newly
 * enrolled account a password.
 * 2. `done`: A function to call when the enrollment UI flow is complete.
 * The normal login process is suspended until this function is called, so that
 * user A can be enrolled even if user B was logged in.
 * @locus Client
 */
Accounts.onEnrollmentLink = function (callback) {
  if (accountsCallbacks["enroll-account"]) {
    Meteor._debug("Accounts.onEnrollmentLink was called more than once. " +
      "Only one callback added will be executed.");
  }

  accountsCallbacks["enroll-account"] = callback;
};
