if (!Meteor.accounts) {
  Meteor.accounts = {};
}

if (!Meteor.accounts._options) {
  Meteor.accounts._options = {};
}

// @param options {Object} an object with fields:
// - requireEmail {Boolean}
// - requireUsername {Boolean}
// - validateEmails {Boolean} Send validation emails to all new users
//                            via the signup form
Meteor.accounts.config = function(options) {
  Meteor.accounts._options = options;
};


// internal login tokens collection. Never published.
Meteor.accounts._loginTokens = new Meteor.Collection(
  "accounts._loginTokens",
  null /*manager*/,
  null /*driver*/,
  true /*preventAutopublish*/);
// Don't let people write to the collection, even in insecure
// mode. There's no good reason for people to be fishing around in this
// table, and it is _really_ insecure to allow it as users could easily
// steal sessions and impersonate other users. Users can override by
// calling more allows later, if they really want.
Meteor.accounts._loginTokens.allow({});


// Users table. Don't use the normal autopublish, since we want to hide
// some fields. Code to autopublish this is in accounts_server.js.
Meteor.users = new Meteor.Collection(
  "users",
  null /*manager*/,
  null /*driver*/,
  true /*preventAutopublish*/);
// There is an allow call in accounts_server that restricts this
// collection.


// Table containing documents with configuration options for each
// login service
Meteor.accounts.configuration = new Meteor.Collection(
  "accounts._loginServiceConfiguration",
  null /*manager*/,
  null /*driver*/,
  true /*preventAutopublish*/);
// Leave this collection open in insecure mode. In theory, someone could
// hijack your oauth connect requests to a different endpoint or appId,
// but you did ask for 'insecure'. The advantage is that it is much
// easier to write a configuration wizard that works only in insecure
// mode.


// Thrown when trying to use a login service which is not configured
Meteor.accounts.ConfigError = function(description) {
  this.message = description;
};
Meteor.accounts.ConfigError.prototype = new Error();
Meteor.accounts.ConfigError.prototype.name = 'Meteor.accounts.ConfigError';

// Thrown when the user cancels the login process (eg, closes an oauth
// popup, declines retina scan, etc)
Meteor.accounts.LoginCancelledError = function(description) {
  this.message = description;
  this.cancelled = true;
};
Meteor.accounts.LoginCancelledError.prototype = new Error();
Meteor.accounts.LoginCancelledError.prototype.name = 'Meteor.accounts.LoginCancelledError';

