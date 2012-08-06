(function() {
  // To be used as the local storage key
  var loginTokenKey = "Meteor.loginToken";
  var userIdKey = "Meteor.userId";

  Meteor.accounts.storeLoginToken = function(userId, token) {
    localStorage.setItem(userIdKey, userId);
    localStorage.setItem(loginTokenKey, token);

    // to ensure that the localstorage poller doesn't end up trying to
    // connect a second time
    Meteor.accounts._lastLoginTokenWhenPolled = token;
  };

  Meteor.accounts.unstoreLoginToken = function() {
    localStorage.removeItem(userIdKey);
    localStorage.removeItem(loginTokenKey);

    // to ensure that the localstorage poller doesn't end up trying to
    // connect a second time
    Meteor.accounts._lastLoginTokenWhenPolled = null;
  };

  Meteor.accounts.storedLoginToken = function() {
    return localStorage.getItem(loginTokenKey);
  };

  Meteor.accounts.storedUserId = function() {
    return localStorage.getItem(userIdKey);
  };

  Meteor.accounts.makeClientLoggedOut = function() {
    Meteor.accounts.unstoreLoginToken();
    Meteor.default_connection.setUserId(null);
    Meteor.default_connection.onReconnect = null;
  };

  Meteor.accounts.makeClientLoggedIn = function(userId, token) {
    Meteor.accounts.storeLoginToken(userId, token);
    Meteor.default_connection.setUserId(userId);
    Meteor.default_connection.onReconnect = function() {
      Meteor.apply('login', [{resume: token}], {wait: true}, function(error, result) {
        if (error) {
          Meteor.accounts.makeClientLoggedOut();
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

    Meteor.accounts.makeClientLoggedIn(result.id, result.token);
  });
};

if (!Meteor.accounts._preventAutoLogin) {
  // Immediately try to log in via local storage, so that any DDP
  // messages are sent after we have established our user account
  var token = Meteor.accounts.storedLoginToken();
  if (token) {
    // On startup, optimistically present us as logged in while the
    // request is in flight. This reduces page flicker on startup.
    var userId = Meteor.accounts.storedUserId();
    userId && Meteor.default_connection.setUserId(userId);
    Meteor.loginWithToken(token, function () {
      Meteor.accounts.makeClientLoggedOut();
    });
  }
}

// Poll local storage every 3 seconds to login if someone logged in in
// another tab
Meteor.accounts._lastLoginTokenWhenPolled = token;
setInterval(function() {
  if (Meteor.accounts._preventAutoLogin)
    return;

  var currentLoginToken = Meteor.accounts.storedLoginToken();

  // != instead of !== just to make sure undefined and null are treated the same
  if (Meteor.accounts._lastLoginTokenWhenPolled != currentLoginToken) {
    if (currentLoginToken)
      Meteor.loginWithToken(currentLoginToken);
    else
      Meteor.logout();
  }
  Meteor.accounts._lastLoginTokenWhenPolled = currentLoginToken;
}, 3000);
