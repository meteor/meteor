Accounts = {};

// Currently this is read directly by packages like accounts-password
// and accounts-ui-unstyled.
Accounts._options = {};

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
// - _tokenLifetime {Number}
//     Seconds until a login token expires.
// - _tokenExpirationInterval {Number}
//     How often (in seconds) to check for expired tokens
// - _minTokenLifetime {Number}
//     The minimum number of seconds until a token expires in order for the
//     client to be willing to connect with that token.
//
Accounts.config = function(options) {
  // validate option keys
  var VALID_KEYS = ["sendVerificationEmail", "forbidClientAccountCreation",
                    "_tokenLifetime", "_tokenExpirationInterval",
                    "_minTokenLifetime"];
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
        if (key === "_tokenExpirationInterval" && Meteor.isServer)
          initExpireTokenInterval();
      }
    }
  });
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

// how long (in seconds) until a login token expires
DEFAULT_TOKEN_LIFETIME = 604800; // one week
// We don't try to auto-login with a token that is going to expire within
// MIN_TOKEN_LIFETIME seconds, to avoid abrupt disconnects from expiring tokens.
var DEFAULT_MIN_TOKEN_LIFETIME = 3600; // one hour

Accounts._tokenExpiration = function (when) {
  var tokenLifetime = Accounts._options._tokenLifetime ||
        DEFAULT_TOKEN_LIFETIME;
  return new Date(when.getTime() + tokenLifetime * 1000);
};

Accounts._tokenExpiresSoon = function (when) {
  var minLifetime = Accounts._options._minTokenLifetime ||
        DEFAULT_MIN_TOKEN_LIFETIME;
  return new Date() > (new Date(when) - minLifetime * 1000);
};
