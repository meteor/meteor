// This file deals with storing a login token and user id in the
// browser's localStorage facility. It polls local storage every few
// seconds to synchronize login state between multiple tabs in the same
// browser.

// Login with a Meteor access token. This is the only public function
// here.
Accounts.loginWithToken = function (token, callback) {
  Accounts.callLoginMethod({
    methodArguments: [{resume: token}],
    userCallback: callback});
};

// Preserve backwards compatibility.
Meteor.loginWithToken = Accounts.loginWithToken;

// Semi-internal API. Call this function to re-enable auto login after
// if it was disabled at startup.
Accounts._enableAutoLogin = function () {
  Accounts._preventAutoLogin = false;
  Accounts._pollStoredLoginToken();
};


///
/// STORING
///

// Key names to use in localStorage
var loginTokenKey = "Meteor.loginToken";
var userIdKey = "Meteor.userId";

// Call this from the top level of the test file for any test that does
// logging in and out, to protect multiple tabs running the same tests
// simultaneously from interfering with each others' localStorage.
Accounts._isolateLoginTokenForTest = function () {
  loginTokenKey = loginTokenKey + Random.id();
  userIdKey = userIdKey + Random.id();
};

Accounts._storeLoginToken = function(userId, token) {
  Meteor._localStorage.setItem(userIdKey, userId);
  Meteor._localStorage.setItem(loginTokenKey, token);

  // to ensure that the localstorage poller doesn't end up trying to
  // connect a second time
  Accounts._lastLoginTokenWhenPolled = token;
};

Accounts._unstoreLoginToken = function() {
  Meteor._localStorage.removeItem(userIdKey);
  Meteor._localStorage.removeItem(loginTokenKey);

  // to ensure that the localstorage poller doesn't end up trying to
  // connect a second time
  Accounts._lastLoginTokenWhenPolled = null;
};

Accounts._storedLoginToken = function() {
  return Meteor._localStorage.getItem(loginTokenKey);
};

Accounts._storedUserId = function() {
  return Meteor._localStorage.getItem(userIdKey);
};


///
/// AUTO-LOGIN
///

if (!Accounts._preventAutoLogin) {
  // Immediately try to log in via local storage, so that any DDP
  // messages are sent after we have established our user account
  var token = Accounts._storedLoginToken();
  if (token) {
    // On startup, optimistically present us as logged in while the
    // request is in flight. This reduces page flicker on startup.
    var userId = Accounts._storedUserId();
    userId && Meteor.default_connection.setUserId(userId);
    Accounts.loginWithToken(token, function (err) {
      if (err) {
        Meteor._debug("Error logging in with token: " + err);
        Accounts._makeClientLoggedOut();
      }
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
      Accounts.loginWithToken(currentLoginToken); // XXX should we pass a callback here?
    else
      Meteor.logout();
  }
  Accounts._lastLoginTokenWhenPolled = currentLoginToken;
};

setInterval(Accounts._pollStoredLoginToken, 3000);
