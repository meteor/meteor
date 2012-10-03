(function() {
  // To be used as the local storage key
  var loginTokenKey = "Meteor.loginToken";
  var userIdKey = "Meteor.userId";

  Accounts._storeLoginToken = function(userId, token) {
    localStorage.setItem(userIdKey, userId);
    localStorage.setItem(loginTokenKey, token);

    // to ensure that the localstorage poller doesn't end up trying to
    // connect a second time
    Accounts._lastLoginTokenWhenPolled = token;
  };

  Accounts._unstoreLoginToken = function() {
    localStorage.removeItem(userIdKey);
    localStorage.removeItem(loginTokenKey);

    // to ensure that the localstorage poller doesn't end up trying to
    // connect a second time
    Accounts._lastLoginTokenWhenPolled = null;
  };

  Accounts._storedLoginToken = function() {
    return localStorage.getItem(loginTokenKey);
  };

  Accounts._storedUserId = function() {
    return localStorage.getItem(userIdKey);
  };

  Accounts._makeClientLoggedOut = function() {
    Accounts._unstoreLoginToken();
    Meteor.default_connection.setUserId(null);
    Meteor.default_connection.onReconnect = null;
  };

  Accounts._makeClientLoggedIn = function(userId, token) {
    Accounts._storeLoginToken(userId, token);
    Meteor.default_connection.setUserId(userId);
    Meteor.default_connection.onReconnect = function() {
      Meteor.apply('login', [{resume: token}], {wait: true}, function(error, result) {
        if (error) {
          Accounts._makeClientLoggedOut();
          throw error;
        } else {
          // nothing to do
        }
      });
    };
  };
})();

// Login with a Meteor access token
//
// XXX having errorCallback only here is weird since other login
// methods will have different callbacks. Standardize this.
Meteor.loginWithToken = function (token, errorCallback) {
  Meteor.apply('login', [{resume: token}], {wait: true}, function(error, result) {
    if (error) {
      errorCallback();
      throw error;
    }

    Accounts._makeClientLoggedIn(result.id, result.token);
  });
};

if (!Accounts._preventAutoLogin) {
  // Immediately try to log in via local storage, so that any DDP
  // messages are sent after we have established our user account
  var token = Accounts._storedLoginToken();
  if (token) {
    // On startup, optimistically present us as logged in while the
    // request is in flight. This reduces page flicker on startup.
    var userId = Accounts._storedUserId();
    userId && Meteor.default_connection.setUserId(userId);
    Meteor.loginWithToken(token, function () {
      Accounts._makeClientLoggedOut();
    });
  }
}

// Poll local storage every 3 seconds to login if someone logged in in
// another tab
Accounts._lastLoginTokenWhenPolled = token;
Accounts._pollStoredLoginToken = function() {
  if (Accounts._preventAutoLogin)
    return;

  var currentLoginToken = Accounts._storedLoginToken();

  // != instead of !== just to make sure undefined and null are treated the same
  if (Accounts._lastLoginTokenWhenPolled != currentLoginToken) {
    if (currentLoginToken)
      Meteor.loginWithToken(currentLoginToken); // XXX should we pass a callback here?
    else
      Meteor.logout();
  }
  Accounts._lastLoginTokenWhenPolled = currentLoginToken;
};

// Semi-internal API. Call this function to re-enable auto login after
// if it was disabled at startup.
Accounts._enableAutoLogin = function () {
  Accounts._preventAutoLogin = false;
  Accounts._pollStoredLoginToken();
};

setInterval(Accounts._pollStoredLoginToken, 3000);
