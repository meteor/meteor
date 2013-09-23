Accounts = {};

// Currently this is read directly by packages like accounts-password
// and accounts-ui-unstyled.
Accounts._options = {};

// how long (in days) until a login token expires
var DEFAULT_LOGIN_EXPIRATION_DAYS = 90;
// Clients don't try to auto-login with a token that is going to expire within
// .1 * DEFAULT_LOGIN_EXPIRATION_DAYS, capped at MIN_TOKEN_LIFETIME_CAP_SECS.
// Tries to avoid abrupt disconnects from expiring tokens.
var MIN_TOKEN_LIFETIME_CAP_SECS = 3600; // one hour
// how often (in milliseconds) we check for expired tokens
EXPIRE_TOKENS_INTERVAL_MS = 600 * 1000; // 10 minutes
// how long we wait before logging out clients when Meteor.logoutOtherClients is
// called
DEFAULT_CONNECTION_CLOSE_DELAY_SECS = 10;

// Set up config for the accounts system. Call this on both the client
// and the server.
//
// XXX we should add some enforcement that this is called on both the
// client and the server. Otherwise, a user can
// 'forbidClientAccountCreation' only on the client and while it looks
// like their app is secure, the server will still accept createUser
// calls. https://github.com/meteor/meteor/issues/828
//
// @param options {Object} an object with fields:
// - sendVerificationEmail {Boolean}
//     Send email address verification emails to new users created from
//     client signups.
// - forbidClientAccountCreation {Boolean}
//     Do not allow clients to create accounts directly.
// - loginExpirationInDays {Number}
//     Number of days since login until a user is logged out (login token
//     expires).
// - _connectionCloseDelaySecs {Number}
//     The number of seconds to wait before closing connections that when a user
//     is logged out by the server. Defaults to 10, to allow clients to store a
//     fresh token in localStorage when calling logoutOtherClients.
//
Accounts.config = function(options) {
  // validate option keys
  var VALID_KEYS = ["sendVerificationEmail", "forbidClientAccountCreation",
                    "restrictCreationByEmailDomain", "loginExpirationInDays",
                    "_connectionCloseDelaySecs"];
  _.each(_.keys(options), function (key) {
    if (!_.contains(VALID_KEYS, key)) {
      throw new Error("Accounts.config: Invalid key: " + key);
    }
  });

  // set values in Accounts._options
  _.each(VALID_KEYS, function (key) {
    if (key in options) {
      if (key in Accounts._options) {
        throw new Error("Can't set `" + key + "` more than once");
      } else {
        Accounts._options[key] = options[key];
      }
    }
  });

  // If the user set loginExpirationInDays to null, then we need to clear the
  // timer that periodically expires tokens.
  if (Meteor.isServer)
    maybeStopExpireTokensInterval();
};

// Users table. Don't use the normal autopublish, since we want to hide
// some fields. Code to autopublish this is in accounts_server.js.
// XXX Allow users to configure this collection name.
//
Meteor.users = new Meteor.Collection("users", {_preventAutopublish: true});
// There is an allow call in accounts_server that restricts this
// collection.

// loginServiceConfiguration and ConfigError are maintained for backwards compatibility
Accounts.loginServiceConfiguration = ServiceConfiguration.configurations;
Accounts.ConfigError = ServiceConfiguration.ConfigError;

// Thrown when the user cancels the login process (eg, closes an oauth
// popup, declines retina scan, etc)
Accounts.LoginCancelledError = function(description) {
  this.message = description;
};

// This is used to transmit specific subclass errors over the wire. We should
// come up with a more generic way to do this (eg, with some sort of symbolic
// error code rather than a number).
Accounts.LoginCancelledError.numericError = 0x8acdc2f;
Accounts.LoginCancelledError.prototype = new Error();
Accounts.LoginCancelledError.prototype.name = 'Accounts.LoginCancelledError';

getTokenLifetimeMs = function () {
  return (Accounts._options.loginExpirationInDays ||
          DEFAULT_LOGIN_EXPIRATION_DAYS) * 24 * 60 * 60 * 1000;
};

Accounts._tokenExpiration = function (when) {
  return new Date(when.getTime() + getTokenLifetimeMs());
};

Accounts._tokenExpiresSoon = function (when) {
  var minLifetimeMs = .1 * getTokenLifetimeMs();
  var minLifetimeCapMs = MIN_TOKEN_LIFETIME_CAP_SECS * 1000;
  if (minLifetimeMs > minLifetimeCapMs)
    minLifetimeMs = minLifetimeCapMs
  return new Date() > (new Date(when) - minLifetimeMs);
};
