if (typeof Accounts === 'undefined')
  Accounts = {};

if (!Accounts._options) {
  Accounts._options = {};
}

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
Accounts.config = function(options) {
  // validate option keys
  var VALID_KEYS = ["sendVerificationEmail", "forbidClientAccountCreation"];
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
};

// Users table. Don't use the normal autopublish, since we want to hide
// some fields. Code to autopublish this is in accounts_server.js.
// XXX Allow users to configure this collection name.
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

