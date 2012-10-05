if (typeof Accounts === 'undefined')
  Accounts = {};

if (!Accounts._options) {
  Accounts._options = {};
}

// @param options {Object} an object with fields:
// - requireEmail {Boolean}
// - requireUsername {Boolean}
// - validateEmails {Boolean} Send validation emails to all new users
//                            via the signup form
Accounts.config = function(options) {
  Accounts._options = options;
};


// internal login tokens collection. Never published.
Accounts._loginTokens = new Meteor.Collection(
  "meteor_accounts_loginTokens", {_preventAutopublish: true});
// Don't let people write to the collection, even in insecure
// mode. There's no good reason for people to be fishing around in this
// table, and it is _really_ insecure to allow it as users could easily
// steal sessions and impersonate other users. Users can override by
// calling more allows later, if they really want.
Accounts._loginTokens.allow({});


// Users table. Don't use the normal autopublish, since we want to hide
// some fields. Code to autopublish this is in accounts_server.js.
// XXX Allow users to configure this collection name.
Meteor.users = new Meteor.Collection("users", {_preventAutopublish: true});
// There is an allow call in accounts_server that restricts this
// collection.


// Table containing documents with configuration options for each
// login service
Accounts.configuration = new Meteor.Collection(
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

