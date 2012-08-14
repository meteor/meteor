// XXX namespacing

Meteor._MethodInvocation = function (is_simulation, userId,
                                     globallySetUserId, unblock) {
  var self = this;

  // true if we're running not the actual method, but a stub (that is,
  // if we're on a client (which may be a browser, or in the future a
  // server connecting to another server) and presently running a
  // simulation of a server-side method for latency compensation
  // purposes). not current true except in a client such as a browser,
  // since there's usually no point in running stubs unless you have a
  // zero-latency connection to the user.
  this.is_simulation = is_simulation;

  // call this function to allow other method invocations (from the
  // same client) to continue running without waiting for this one to
  // complete.
  this.unblock = unblock || function () {};

  // current user id
  this._userId = userId;

  // sets current user id in all appropriate server contexts and
  // reruns subscriptions
  this._setUserId = globallySetUserId || function () {};
};

_.extend(Meteor._MethodInvocation.prototype, {
  userId: function() {
    return this._userId;
  },

  setUserId: function(userId) {
    this._userId = userId;
    this._setUserId(userId);
  }
});

Meteor._CurrentInvocation = new Meteor.EnvironmentVariable;

Meteor.Error = function (error, reason, details) {
  var self = this;

  // Currently, a numeric code, likely similar to a HTTP code (eg,
  // 404, 500). That is likely to change though.
  self.error = error;

  // Optional: A short human-readable summary of the error. Not
  // intended to be shown to end users, just developers. ("Not Found",
  // "Internal Server Error")
  self.reason = reason;

  // Optional: Additional information about the error, say for
  // debugging. It might be a (textual) stack trace if the server is
  // willing to provide one. The corresponding thing in HTTP would be
  // the body of a 404 or 500 response. (The difference is that we
  // never expect this to be shown to end users, only developers, so
  // it doesn't need to be pretty.)
  self.details = details;
};

Meteor.Error.prototype = new Error;
