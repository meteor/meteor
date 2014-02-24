///
/// CURRENT USER
///

// This is reactive.
Meteor.userId = function () {
  return Accounts.connection.userId();
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
// A login method is a method which on success calls `this.setUserId(id)` and
// `Accounts._setLoginToken` on the server and returns an object with fields
// 'id' (containing the user id), 'token' (containing a resume token), and
// optionally `tokenExpires`.
//
// This function takes care of:
//   - Updating the Meteor.loggingIn() reactive data source
//   - Calling the method in 'wait' mode
//   - On success, saving the resume token to localStorage
//   - On success, calling Accounts.connection.setUserId()
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
      Accounts.connection.onReconnect = null;
    } else {
      Accounts.connection.onReconnect = function () {
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
              var storedTokenNow = storedLoginToken();
              if (error) {
                // If we had a login error AND the current stored token is the
                // one that we tried to log in with, then declare ourselves
                // logged out. If there's a token in storage but it's not the
                // token that we tried to log in with, we don't know anything
                // about whether that token is valid or not, so do nothing. The
                // periodic localStorage poll will decide if we are logged in or
                // out with this token, if it hasn't already. Of course, even
                // with this check, another tab could insert a new valid token
                // immediately before we clear localStorage here, which would
                // lead to both tabs being logged out, but by checking the token
                // in storage right now we hope to make that unlikely to happen.
                //
                // If there is no token in storage right now, we don't have to
                // do anything; whatever code removed the token from storage was
                // responsible for calling `makeClientLoggedOut()`, or the
                // periodic localStorage poll will call `makeClientLoggedOut`
                // eventually if another tab wiped the token from storage.
                if (storedTokenNow && storedTokenNow === result.token) {
                  makeClientLoggedOut();
                }
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
  Accounts.connection.apply(
    options.methodName,
    options.methodArguments,
    {wait: true, onResultReceived: onResultReceived},
    loggedInAndDataReadyCallback);
};

makeClientLoggedOut = function() {
  unstoreLoginToken();
  Accounts.connection.setUserId(null);
  Accounts.connection.onReconnect = null;
};

makeClientLoggedIn = function(userId, token, tokenExpires) {
  storeLoginToken(userId, token, tokenExpires);
  Accounts.connection.setUserId(userId);
};

Meteor.logout = function (callback) {
  Accounts.connection.apply('logout', [], {wait: true}, function(error, result) {
    if (error) {
      callback && callback(error);
    } else {
      makeClientLoggedOut();
      callback && callback();
    }
  });
};

Meteor.logoutOtherClients = function (callback) {
  // Call the `logoutOtherClients` method. Store the login token that we get
  // back and use it to log in again. The server is not supposed to close
  // connections on the old token for 10 seconds, so we should have time to
  // store our new token and log in with it before being disconnected. If we get
  // disconnected, then we'll immediately reconnect with the new token. If for
  // some reason we get disconnected before storing the new token, then the
  // worst that will happen is that we'll have a flicker from trying to log in
  // with the old token before storing and logging in with the new one.
  Accounts.connection.apply('logoutOtherClients', [], { wait: true },
               function (error, result) {
                 if (error) {
                   callback && callback(error);
                 } else {
                   var userId = Meteor.userId();
                   storeLoginToken(userId, result.token, result.tokenExpires);
                   // If the server hasn't disconnected us yet by deleting our
                   // old token, then logging in now with the new valid token
                   // will prevent us from getting disconnected. If the server
                   // has already disconnected us due to our old invalid token,
                   // then we would have already tried and failed to login with
                   // the old token on reconnect, and we have to make sure a
                   // login method gets sent here with the new token.
                   Meteor.loginWithToken(result.token, function (err) {
                     if (err &&
                         storedLoginToken() &&
                         storedLoginToken().token === result.token) {
                       makeClientLoggedOut();
                     }
                     callback && callback(err);
                   });
                 }
               });
};


///
/// LOGIN SERVICES
///

var loginServicesHandle =
  Accounts.connection.subscribe("meteor.loginServiceConfiguration");

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
