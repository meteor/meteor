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
CONNECTION_CLOSE_DELAY_MS = 10 * 1000;

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
// - restrictCreationByEmailDomain {Function or String}
//     Require created users to have an email matching the function or
//     having the string as domain.
// - loginExpirationInDays {Number}
//     Number of days since login until a user is logged out (login token
//     expires).
//
Accounts.config = function(options) {
  // We don't want users to accidentally only call Accounts.config on the
  // client, where some of the options will have partial effects (eg removing
  // the "create account" button from accounts-ui if forbidClientAccountCreation
  // is set, or redirecting Google login to a specific-domain page) without
  // having their full effects.
  if (Meteor.isServer) {
    __meteor_runtime_config__.accountsConfigCalled = true;
  } else if (!__meteor_runtime_config__.accountsConfigCalled) {
    // XXX would be nice to "crash" the client and replace the UI with an error
    // message, but there's no trivial way to do this.
    Meteor._debug("Accounts.config was called on the client but not on the " +
                  "server; some configuration options may not take effect.");
  }

  // validate option keys
  var VALID_KEYS = ["sendVerificationEmail", "forbidClientAccountCreation",
                    "restrictCreationByEmailDomain", "loginExpirationInDays"];
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

if (Meteor.isClient) {
  // The connection used by the Accounts system. This is the connection
  // that will get logged in by Meteor.login(), and this is the
  // connection whose login state will be reflected by Meteor.userId().
  //
  // It would be much preferable for this to be in accounts_client.js,
  // but it has to be here because it's needed to create the
  // Meteor.users collection.
  Accounts.connection = Meteor.connection;

  if (typeof __meteor_runtime_config__ !== "undefined" &&
      __meteor_runtime_config__.ACCOUNTS_CONNECTION_URL) {
    // Temporary, internal hook to allow the server to point the client
    // to a different authentication server. This is for a very
    // particular use case that comes up when implementing a oauth
    // server. Unsupported and may go away at any point in time.
    //
    // We will eventually provide a general way to use account-base
    // against any DDP connection, not just one special one.
    Accounts.connection = DDP.connect(
      __meteor_runtime_config__.ACCOUNTS_CONNECTION_URL)
  }
}

// Users table. Don't use the normal autopublish, since we want to hide
// some fields. Code to autopublish this is in accounts_server.js.
// XXX Allow users to configure this collection name.
//
Meteor.users = new Meteor.Collection("users", {
  _preventAutopublish: true,
  connection: Meteor.isClient ? Accounts.connection : Meteor.connection
});
// There is an allow call in accounts_server that restricts this
// collection.

// loginServiceConfiguration and ConfigError are maintained for backwards compatibility
Meteor.startup(function () {
  var ServiceConfiguration =
    Package['service-configuration'].ServiceConfiguration;
  Accounts.loginServiceConfiguration = ServiceConfiguration.configurations;
  Accounts.ConfigError = ServiceConfiguration.ConfigError;
});

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
  // We pass when through the Date constructor for backwards compatibility;
  // `when` used to be a number.
  return new Date((new Date(when)).getTime() + getTokenLifetimeMs());
};

Accounts._tokenExpiresSoon = function (when) {
  var minLifetimeMs = .1 * getTokenLifetimeMs();
  var minLifetimeCapMs = MIN_TOKEN_LIFETIME_CAP_SECS * 1000;
  if (minLifetimeMs > minLifetimeCapMs)
    minLifetimeMs = minLifetimeCapMs;
  return new Date() > (new Date(when) - minLifetimeMs);
};
