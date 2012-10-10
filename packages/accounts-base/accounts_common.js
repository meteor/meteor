if (typeof Accounts === 'undefined')
  Accounts = {};

if (!Accounts._options) {
  Accounts._options = {};
}

// @param options {Object} an object with fields:
// - sendVerificationEmail {Boolean}
//     Send email address verification emails to new users created from
//     client signups.
// - forbidClientAccountCreation {Boolean}
//     Do not allow clients to create accounts directly.
Accounts.config = function(options) {
  _.each(["sendVerificationEmail", "forbidClientAccountCreation"], function(key) {
    if (key in options) {
      if (key in Accounts._options)
        throw new Error("Can't set `" + key + "` more than once");
      else
        Accounts._options[key] = options[key];
    }
  });
};

// Users table. Don't use the normal autopublish, since we want to hide
// some fields. Code to autopublish this is in accounts_server.js.
// XXX Allow users to configure this collection name.
Meteor.users = new Meteor.Collection("users", {_preventAutopublish: true});
// There is an allow call in accounts_server that restricts this
// collection.


// Table containing documents with configuration options for each
// login service
Accounts.loginServiceConfiguration = new Meteor.Collection(
  "meteor_accounts_loginServiceConfiguration", {_preventAutopublish: true});
// Leave this collection open in insecure mode. In theory, someone could
// hijack your oauth connect requests to a different endpoint or appId,
// but you did ask for 'insecure'. The advantage is that it is much
// easier to write a configuration wizard that works only in insecure
// mode.


// Thrown when trying to use a login service which is not configured
Accounts.ConfigError = function(description) {
  this.message = description;
};
Accounts.ConfigError.prototype = new Error();
Accounts.ConfigError.prototype.name = 'Accounts.ConfigError';

// Thrown when the user cancels the login process (eg, closes an oauth
// popup, declines retina scan, etc)
Accounts.LoginCancelledError = function(description) {
  this.message = description;
  this.cancelled = true;
};
Accounts.LoginCancelledError.prototype = new Error();
Accounts.LoginCancelledError.prototype.name = 'Accounts.LoginCancelledError';

