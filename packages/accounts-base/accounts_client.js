///
/// CURRENT USER
///

// This is reactive.
Meteor.userId = function () {
  return Meteor.connection.userId();
};

var loggingIn = false;
var loggingInDeps = new Deps.Dependency;
// This is mostly just called within this file, but Meteor.loginWithPassword
// also uses it to make loggingIn() be true during the beginPasswordExchange
// method call too.
Accounts._setLoggingIn = function (x) {
  if (loggingIn !== x) {
    loggingIn = x;
    loggingInDeps.changed();
  }
};
Meteor.loggingIn = function () {
  loggingInDeps.depend();
  return loggingIn;
};

// This calls userId, which is reactive.
Meteor.user = function () {
  var userId = Meteor.userId();
  if (!userId)
    return null;
  return Meteor.users.findOne(userId);
};

///
/// LOGIN METHODS
///

// Call a login method on the server.
//
// A login method is a method which on success calls `this.setUserId(id)` on
// the server and returns an object with fields 'id' (containing the user id)
// and 'token' (containing a resume token).
//
// This function takes care of:
//   - Updating the Meteor.loggingIn() reactive data source
//   - Calling the method in 'wait' mode
//   - On success, saving the resume token to localStorage
//   - On success, calling Meteor.connection.setUserId()
//   - Setting up an onReconnect handler which logs in with
//     the resume token
//
// Options:
// - methodName: The method to call (default 'login')
// - methodArguments: The arguments for the method
// - validateResult: If provided, will be called with the result of the
//                 method. If it throws, the client will not be logged in (and
//                 its error will be passed to the callback).
// - userCallback: Will be called with no arguments once the user is fully
//                 logged in, or with the error on error.
//
Accounts.callLoginMethod = function (options) {
  options = _.extend({
    methodName: 'login',
    methodArguments: [],
    _suppressLoggingIn: false
  }, options);
  // Set defaults for callback arguments to no-op functions; make sure we
  // override falsey values too.
  _.each(['validateResult', 'userCallback'], function (f) {
    if (!options[f])
      options[f] = function () {};
  });
  // make sure we only call the user's callback once.
  var onceUserCallback = _.once(options.userCallback);

  var reconnected = false;

  // We want to set up onReconnect as soon as we get a result token back from
  // the server, without having to wait for subscriptions to rerun. This is
  // because if we disconnect and reconnect between getting the result and
  // getting the results of subscription rerun, we WILL NOT re-send this
  // method (because we never re-send methods whose results we've received)
  // but we WILL call loggedInAndDataReadyCallback at "reconnect quiesce"
  // time. This will lead to makeClientLoggedIn(result.id) even though we
  // haven't actually sent a login method!
  //
  // But by making sure that we send this "resume" login in that case (and
  // calling makeClientLoggedOut if it fails), we'll end up with an accurate
  // client-side userId. (It's important that livedata_connection guarantees
  // that the "reconnect quiesce"-time call to loggedInAndDataReadyCallback
  // will occur before the callback from the resume login call.)
  var onResultReceived = function (err, result) {
    if (err || !result || !result.token) {
      Meteor.connection.onReconnect = null;
    } else {
      Meteor.connection.onReconnect = function () {
        reconnected = true;
        // If our token was updated in storage, use the latest one.
        var storedToken = storedLoginToken();
        if (storedToken) {
          result = {
            token: storedToken,
            tokenExpires: storedLoginTokenExpires()
          };
        }
        if (! result.tokenExpires)
          result.tokenExpires = Accounts._tokenExpiration(new Date());
        if (Accounts._tokenExpiresSoon(result.tokenExpires)) {
          makeClientLoggedOut();
        } else {
          Accounts.callLoginMethod({
            methodArguments: [{resume: result.token}],
            // Reconnect quiescence ensures that the user doesn't see an
            // intermediate state before the login method finishes. So we don't
            // need to show a logging-in animation.
            _suppressLoggingIn: true,
            userCallback: function (error) {
              if (error) {
                makeClientLoggedOut();
              }
              // Possibly a weird callback to call, but better than nothing if
              // there is a reconnect between "login result received" and "data
              // ready".
              onceUserCallback(error);
            }});
        }
      };
    }
  };

  // This callback is called once the local cache of the current-user
  // subscription (and all subscriptions, in fact) are guaranteed to be up to
  // date.
  var loggedInAndDataReadyCallback = function (error, result) {
    // If the login method returns its result but the connection is lost
    // before the data is in the local cache, it'll set an onReconnect (see
    // above). The onReconnect will try to log in using the token, and *it*
    // will call userCallback via its own version of this
    // loggedInAndDataReadyCallback. So we don't have to do anything here.
    if (reconnected)
      return;

    // Note that we need to call this even if _suppressLoggingIn is true,
    // because it could be matching a _setLoggingIn(true) from a
    // half-completed pre-reconnect login method.
    Accounts._setLoggingIn(false);
    if (error || !result) {
      error = error || new Error(
        "No result from call to " + options.methodName);
      onceUserCallback(error);
      return;
    }
    try {
      options.validateResult(result);
    } catch (e) {
      onceUserCallback(e);
      return;
    }

    // Make the client logged in. (The user data should already be loaded!)
    makeClientLoggedIn(result.id, result.token, result.tokenExpires);
    onceUserCallback();
  };

  if (!options._suppressLoggingIn)
    Accounts._setLoggingIn(true);
  Meteor.apply(
    options.methodName,
    options.methodArguments,
    {wait: true, onResultReceived: onResultReceived},
    loggedInAndDataReadyCallback);
};

makeClientLoggedOut = function() {
  unstoreLoginToken();
  Meteor.connection.setUserId(null);
  Meteor.connection.onReconnect = null;
};

makeClientLoggedIn = function(userId, token, tokenExpires) {
  storeLoginToken(userId, token, tokenExpires);
  Meteor.connection.setUserId(userId);
};

Meteor.logout = function (callback) {
  Meteor.apply('logout', [], {wait: true}, function(error, result) {
    if (error) {
      callback && callback(error);
    } else {
      makeClientLoggedOut();
      callback && callback();
    }
  });
};

Meteor.logoutOtherClients = function (callback) {
  // Our connection is going to be closed, but we don't want to call the
  // onReconnect handler until the result comes back for this method, because
  // the token will have been deleted on the server. Instead, wait until we get
  // a new token and call the reconnect handler with that.
  // XXX this is messy.
  // XXX what if login gets called before the callback runs?
  var origOnReconnect = Meteor.connection.onReconnect;
  var userId = Meteor.userId();
  Meteor.connection.onReconnect = null;
  Meteor.apply('logoutOtherClients', [], { wait: true },
               function (error, result) {
                 Meteor.connection.onReconnect = origOnReconnect;
                 if (! error)
                   storeLoginToken(userId, result.token, result.tokenExpires);
                 Meteor.connection.onReconnect();
                 callback && callback(error);
               });
};

///
/// LOGIN SERVICES
///

var loginServicesHandle = Meteor.subscribe("meteor.loginServiceConfiguration");

// A reactive function returning whether the loginServiceConfiguration
// subscription is ready. Used by accounts-ui to hide the login button
// until we have all the configuration loaded
//
Accounts.loginServicesConfigured = function () {
  return loginServicesHandle.ready();
};

///
/// HANDLEBARS HELPERS
///

// If we're using Handlebars, register the {{currentUser}} and
// {{loggingIn}} global helpers.
if (Package.handlebars) {
  Package.handlebars.Handlebars.registerHelper('currentUser', function () {
    return Meteor.user();
  });
  Package.handlebars.Handlebars.registerHelper('loggingIn', function () {
    return Meteor.loggingIn();
  });
}
