(function() {
  // To be used as the local storage key
  var loginTokenKey = "Meteor.loginToken";

  Meteor.accounts.storeLoginToken = function(token) {
    localStorage.setItem(loginTokenKey, token);

    // to ensure that the localstorage poller doesn't end up trying to
    // connect a second time
    Meteor.accounts._lastLoginTokenWhenPolled = token;
  };

  Meteor.accounts.unstoreLoginToken = function() {
    localStorage.removeItem(loginTokenKey);

    // to ensure that the localstorage poller doesn't end up trying to
    // connect a second time
    Meteor.accounts._lastLoginTokenWhenPolled = null;
  };

  Meteor.accounts.storedLoginToken = function() {
    return localStorage.getItem(loginTokenKey);
  };

  Meteor.accounts.makeClientLoggedOut = function() {
    Meteor.accounts.unstoreLoginToken();
    Meteor.default_connection.setUserId(null);
    Meteor.default_connection.onReconnect = null;
  };

  Meteor.accounts.makeClientLoggedIn = function(userId, token) {
    Meteor.accounts.storeLoginToken(token);
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
Meteor.loginWithToken = function (token) {
  Meteor.apply('login', [{resume: token}], {wait: true}, function(error, result) {
    if (error)
      throw error;

    Meteor.accounts.makeClientLoggedIn(result.id, result.token);
  });
};

Meteor.startup(function() {
  // Immediately try to log in via local storage, so that any DDP
  // messages are sent after we have established our user account
  //
  // NOTE: This must happen in a Meteor.startup block because on IE we
  // need to have installed the localStorage polyfill (see package
  // `localstorage-polyfill`)
  var token = Meteor.accounts.storedLoginToken();
  if (token)
    Meteor.loginWithToken(token);

  // Poll local storage every 3 seconds to login if someone logged in in
  // another tab
  Meteor.accounts._lastLoginTokenWhenPolled = token;
  setInterval(function() {
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
});

