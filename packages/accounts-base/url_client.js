autoLoginEnabled = true;

// All of the special hash URLs we support for accounts interactions
var accountsPaths = ["reset-password", "verify-email", "enroll-account"];

// We only support one callback per URL
var accountsCallbacks = {};

// The UI flow should call this when done to log in the existing person
var doneCallback = function () {
  Accounts._enableAutoLogin();
};

_.each(accountsPaths, function (urlPart) {
  var tokenRegex = new RegExp("^\\#\\/" + urlPart + "\\/(.*)$");
  var match = window.location.hash.match(tokenRegex);

  if (match) {
    // put login in a suspended state to wait for the interaction to finish
    autoLoginEnabled = false;

    // get the token from the URL
    var token = match[1];

    // reset the URL
    window.location.hash = "";

    // if a callback has been registered for this kind of token, call it
    if (accountsCallbacks[urlPart]) {
      accountsCallbacks[urlPart](token, doneCallback);
    }

    // XXX COMPAT WITH 0.9.3
    if (urlPart === "reset-password") {
      Accounts._resetPasswordToken = token;
    } else if (urlPart === "verify-email") {
      Accounts._verifyEmailToken = token;
    } else if (urlPart === "enroll-account") {
      Accounts._enrollAccountToken = token;
    }
  }
});

// XXX these should be moved to accounts-password eventually. Right now
// this is prevented by the need to set autoLoginEnabled=false, but in
// some bright future we won't need to do that anymore.
Accounts.onResetPasswordLink = function (callback) {
  if (accountsCallbacks["reset-password"]) {
    Meteor._debug("Accounts.onResetPasswordLink was called more than once." +
      "Only the last callback added will be executed.");
  }

  accountsCallbacks["reset-password"] = callback;
};

Accounts.onVerifyEmailLink = function (callback) {
  if (accountsCallbacks["verify-email"]) {
    Meteor._debug("Accounts.onVerifyEmailLink was called more than once." +
      "Only the last callback added will be executed.");
  }

  accountsCallbacks["verify-email"] = callback;
};

Accounts.onEnrollAccountLink = function (callback) {
  if (accountsCallbacks["enroll-account"]) {
    Meteor._debug("Accounts.onEnrollAccountLink was called more than once." +
      "Only the last callback added will be executed.");
  }

  accountsCallbacks["enroll-account"] = callback;
};
