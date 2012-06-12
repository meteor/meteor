(function() {
  // To be used as the local storage key
  var loginTokenKey = "Meteor.loginToken";

  Meteor.accounts.loginAndStoreToken = function(token) {
    localStorage.setItem(loginTokenKey, token);
    Meteor.loginFromLocalStorage();
  };

  Meteor.accounts.unstoreLoginToken = function() {
    localStorage.removeItem(loginTokenKey);
  };

  Meteor.accounts.storedLoginToken = function() {
    return localStorage.getItem(loginTokenKey);
  };

  Meteor.accounts.forceClientLoggedOut = function() {
    Meteor.accounts.unstoreLoginToken();
    Meteor.default_connection.setUserId(null);
    Meteor.default_connection.onReconnect = null;
  };
})();

// Tries to log in using a meteor token stored in local storage
Meteor.loginFromLocalStorage = function () {
  var loginToken = Meteor.accounts.storedLoginToken();
  Meteor.accounts._lastLoginTokenWhenPolled = loginToken;
  if (loginToken) {
    Meteor.apply('login', [{resume: loginToken}], {wait: true}, function(error, result) {
      if (error) {
        Meteor._debug("Server error on login", error);
        return;
      }

      Meteor.default_connection.setUserId(result.id);
      Meteor.default_connection.onReconnect = function() {
        Meteor.apply('login', [{resume: loginToken}], {wait: true}, function(error, result) {
          if (error) {
            Meteor.accounts.forceClientLoggedOut();
            Meteor._debug("Server error on login", error);
            return;
          }
        });
      };
    });
  }
};

Meteor.startup(function() {
  // Immediately try to log in via local storage, so that any DDP
  // messages are sent after we have established our user account
  //
  // NOTE: This must happen in a Meteor.startup block because on IE we
  // need to have installed the localStorage polyfill (see package
  // `localstorage-polyfill`)
  Meteor.loginFromLocalStorage();

  // Poll local storage every 3 seconds to login if someone logged in in
  // another tab
  setInterval(function() {
    var currentLoginToken = Meteor.accounts.storedLoginToken();
    if (Meteor.accounts._lastLoginTokenWhenPolled !== currentLoginToken) {
      if (currentLoginToken)
        Meteor.loginFromLocalStorage();
      else
        Meteor.logout();
    }
    Meteor._lastLoginTokenWhenPolled = currentLoginToken;
  }, 3000);
});

