///
/// CURRENT USER
///

// This is reactive.

/**
 * @summary Get the current user id, or `null` if no user is logged in. A reactive data source.
 * @locus Anywhere but publish functions
 */
Meteor.userId = function () {
  return Accounts.connection.userId();
};

var loggingIn = false;
var loggingInDeps = new Tracker.Dependency;
// This is mostly just called within this file, but Meteor.loginWithPassword
// also uses it to make loggingIn() be true during the beginPasswordExchange
// method call too.
Accounts._setLoggingIn = function (x) {
  if (loggingIn !== x) {
    loggingIn = x;
    loggingInDeps.changed();
  }
};

/**
 * @summary True if a login method (such as `Meteor.loginWithPassword`, `Meteor.loginWithFacebook`, or `Accounts.createUser`) is currently in progress. A reactive data source.
 * @locus Client
 */
Meteor.loggingIn = function () {
  loggingInDeps.depend();
  return loggingIn;
};

// This calls userId, which is reactive.

/**
 * @summary Get the current user record, or `null` if no user is logged in. A reactive data source.
 * @locus Anywhere but publish functions
 */
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
    methodArguments: [{}],
    _suppressLoggingIn: false
  }, options);
  // Set defaults for callback arguments to no-op functions; make sure we
  // override falsey values too.
  _.each(['validateResult', 'userCallback'], function (f) {
    if (!options[f])
      options[f] = function () {};
  });
  // Prepare callbacks: user provided and onLogin/onLoginFailure hooks.
  var loginCallbacks = _.once(function (error) {
    if (!error) {
      onLoginHook.each(function (callback) {
        callback();
      });
    } else {
      onLoginFailureHook.each(function (callback) {
        callback();
      });
    }
    options.userCallback.apply(this, arguments);
  });

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
              loginCallbacks(error);
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
      loginCallbacks(error);
      return;
    }
    try {
      options.validateResult(result);
    } catch (e) {
      loginCallbacks(e);
      return;
    }

    // Make the client logged in. (The user data should already be loaded!)
    makeClientLoggedIn(result.id, result.token, result.tokenExpires);
    loginCallbacks();
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

/**
 * @summary Log the user out.
 * @locus Client
 * @param {Function} [callback] Optional callback. Called with no arguments on success, or with a single `Error` argument on failure.
 */
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

/**
 * @summary Log out other clients logged in as the current user, but does not log out the client that calls this function.
 * @locus Client
 * @param {Function} [callback] Optional callback. Called with no arguments on success, or with a single `Error` argument on failure.
 */
Meteor.logoutOtherClients = function (callback) {
  // We need to make two method calls: one to replace our current token,
  // and another to remove all tokens except the current one. We want to
  // call these two methods one after the other, without any other
  // methods running between them. For example, we don't want `logout`
  // to be called in between our two method calls (otherwise the second
  // method call would return an error). Another example: we don't want
  // logout to be called before the callback for `getNewToken`;
  // otherwise we would momentarily log the user out and then write a
  // new token to localStorage.
  //
  // To accomplish this, we make both calls as wait methods, and queue
  // them one after the other, without spinning off the event loop in
  // between. Even though we queue `removeOtherTokens` before
  // `getNewToken`, we won't actually send the `removeOtherTokens` call
  // until the `getNewToken` callback has finished running, because they
  // are both wait methods.
  Accounts.connection.apply(
    'getNewToken',
    [],
    { wait: true },
    function (err, result) {
      if (! err) {
        storeLoginToken(Meteor.userId(), result.token, result.tokenExpires);
      }
    }
  );
  Accounts.connection.apply(
    'removeOtherTokens',
    [],
    { wait: true },
    function (err) {
      callback && callback(err);
    }
  );
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

// Some login services such as the redirect login flow or the resume
// login handler can log the user in at page load time.  The
// Meteor.loginWithX functions have a callback argument, but the
// callback function instance won't be in memory any longer if the
// page was reloaded.  The `onPageLoadLogin` function allows a
// callback to be registered for the case where the login was
// initiated in a previous VM, and we now have the result of the login
// attempt in a new VM.

var pageLoadLoginCallbacks = [];
var pageLoadLoginAttemptInfo = null;

// Register a callback to be called if we have information about a
// login attempt at page load time.  Call the callback immediately if
// we already have the page load login attempt info, otherwise stash
// the callback to be called if and when we do get the attempt info.
//
Accounts.onPageLoadLogin = function (f) {
  if (pageLoadLoginAttemptInfo)
    f(pageLoadLoginAttemptInfo);
  else
    pageLoadLoginCallbacks.push(f);
};


// Receive the information about the login attempt at page load time.
// Call registered callbacks, and also record the info in case
// someone's callback hasn't been registered yet.
//
Accounts._pageLoadLogin = function (attemptInfo) {
  if (pageLoadLoginAttemptInfo) {
    Meteor._debug("Ignoring unexpected duplicate page load login attempt info");
    return;
  }
  _.each(pageLoadLoginCallbacks, function (callback) { callback(attemptInfo); });
  pageLoadLoginCallbacks = [];
  pageLoadLoginAttemptInfo = attemptInfo;
};


///
/// HANDLEBARS HELPERS
///

// If our app has a Blaze, register the {{currentUser}} and {{loggingIn}}
// global helpers.
if (Package.blaze) {
  /**
   * @global
   * @name  currentUser
   * @isHelper true
   * @summary Calls [Meteor.user()](#meteor_user). Use `{{#if currentUser}}` to check whether the user is logged in.
   */
  Package.blaze.Blaze.Template.registerHelper('currentUser', function () {
    return Meteor.user();
  });

  /**
   * @global
   * @name  loggingIn
   * @isHelper true
   * @summary Calls [Meteor.loggingIn()](#meteor_loggingin).
   */
  Package.blaze.Blaze.Template.registerHelper('loggingIn', function () {
    return Meteor.loggingIn();
  });
}
