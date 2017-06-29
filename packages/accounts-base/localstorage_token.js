import {AccountsClient} from "./accounts_client.js";
const Ap = AccountsClient.prototype;

// This file deals with storing a login token and user id in the
// browser's localStorage facility. It polls local storage every few
// seconds to synchronize login state between multiple tabs in the same
// browser.

// Login with a Meteor access token. This is the only public function
// here.
Meteor.loginWithToken = (token, callback) => Accounts.loginWithToken(token, callback);

// XXX is this style of assigning methods OK?
// refs: http://raganwald.com/2015/06/10/mixins.html
// https://github.com/meteor/meteor/blob/devel/packages/underscore/underscore.js#L1287

Object.assign(AccountsClient.prototype, {
  loginWithToken(token, callback) {
    this.callLoginMethod({
      methodArguments: [{
        resume: token
      }],
      userCallback: callback
    });
  },

  // Semi-internal API. Call this function to re-enable auto login after
  // if it was disabled at startup.
  _enableAutoLogin() {
    this._autoLoginEnabled = true;
    this._pollStoredLoginToken();
  },


  ///
  /// STORING
  ///

  // Call this from the top level of the test file for any test that does
  // logging in and out, to protect multiple tabs running the same tests
  // simultaneously from interfering with each others' localStorage.
  _isolateLoginTokenForTest() {
    this.LOGIN_TOKEN_KEY = this.LOGIN_TOKEN_KEY + Random.id();
    this.USER_ID_KEY = this.USER_ID_KEY + Random.id();
  },

  _storeLoginToken(userId, token, tokenExpires) {
    Meteor._localStorage.setItem(this.USER_ID_KEY, userId);
    Meteor._localStorage.setItem(this.LOGIN_TOKEN_KEY, token);
    if (! tokenExpires)
      tokenExpires = this._tokenExpiration(new Date());
    Meteor._localStorage.setItem(this.LOGIN_TOKEN_EXPIRES_KEY, tokenExpires);

    // to ensure that the localstorage poller doesn't end up trying to
    // connect a second time
    this._lastLoginTokenWhenPolled = token;
  },

  _unstoreLoginToken() {
    Meteor._localStorage.removeItem(this.USER_ID_KEY);
    Meteor._localStorage.removeItem(this.LOGIN_TOKEN_KEY);
    Meteor._localStorage.removeItem(this.LOGIN_TOKEN_EXPIRES_KEY);

    // to ensure that the localstorage poller doesn't end up trying to
    // connect a second time
    this._lastLoginTokenWhenPolled = null;
  },

  // This is private, but it is exported for now because it is used by a
  // test in accounts-password.
  //
  _storedLoginToken() {
    return Meteor._localStorage.getItem(this.LOGIN_TOKEN_KEY);
  },

  _storedLoginTokenExpires() {
    return Meteor._localStorage.getItem(this.LOGIN_TOKEN_EXPIRES_KEY);
  },

  _storedUserId() {
    return Meteor._localStorage.getItem(this.USER_ID_KEY);
  },

  _unstoreLoginTokenIfExpiresSoon() {
    const tokenExpires = this._storedLoginTokenExpires();
    if (tokenExpires && this._tokenExpiresSoon(new Date(tokenExpires))) {
      this._unstoreLoginToken();
    }
  },

  ///
  /// AUTO-LOGIN
  ///

  _initLocalStorage() {
    // Key names to use in localStorage
    this.LOGIN_TOKEN_KEY = "Meteor.loginToken";
    this.LOGIN_TOKEN_EXPIRES_KEY = "Meteor.loginTokenExpires";
    this.USER_ID_KEY = "Meteor.userId";

    var rootUrlPathPrefix = __meteor_runtime_config__.ROOT_URL_PATH_PREFIX;
    if (rootUrlPathPrefix || this.connection !== Meteor.connection) {
      // We want to keep using the same keys for existing apps that do not
      // set a custom ROOT_URL_PATH_PREFIX, so that most users will not have
      // to log in again after an app updates to a version of Meteor that
      // contains this code, but it's generally preferable to namespace the
      // keys so that connections from distinct apps to distinct DDP URLs
      // will be distinct in Meteor._localStorage.
      var namespace = ":" + this.connection._stream.rawUrl;
      if (rootUrlPathPrefix) {
        namespace += ":" + rootUrlPathPrefix;
      }
      this.LOGIN_TOKEN_KEY += namespace;
      this.LOGIN_TOKEN_EXPIRES_KEY += namespace;
      this.USER_ID_KEY += namespace;
    }

    let token = undefined;
    if (this._autoLoginEnabled) {
      // Immediately try to log in via local storage, so that any DDP
      // messages are sent after we have established our user account
      this._unstoreLoginTokenIfExpiresSoon();
      token = this._storedLoginToken();
      if (token) {
        // On startup, optimistically present us as logged in while the
        // request is in flight. This reduces page flicker on startup.
        const userId = this._storedUserId();
        userId && this.connection.setUserId(userId);
        this.loginWithToken(token, err => {
          if (err) {
            Meteor._debug("Error logging in with token: " + err);
            this.makeClientLoggedOut();
          }

          this._pageLoadLogin({
            type: "resume",
            allowed: !err,
            error: err,
            methodName: "login",
            // XXX This is duplicate code with loginWithToken, but
            // loginWithToken can also be called at other times besides
            // page load.
            methodArguments: [{resume: token}]
          });
        });
      }
    }

    // Poll local storage every 3 seconds to login if someone logged in in
    // another tab
    this._lastLoginTokenWhenPolled = token;

    if (this._pollIntervalTimer) {
      // Unlikely that _initLocalStorage will be called more than once for
      // the same AccountsClient instance, but just in case...
      clearInterval(this._pollIntervalTimer);
    }

    this._pollIntervalTimer = setInterval(() => {
      this._pollStoredLoginToken();
    }, 3000);
  },

  _pollStoredLoginToken() {
    if (!this._autoLoginEnabled) {
      return;
    }

    const currentLoginToken = this._storedLoginToken();

    // != instead of !== just to make sure undefined and null are treated the same
    if (this._lastLoginTokenWhenPolled != currentLoginToken) {
      if (currentLoginToken) {
        this.loginWithToken(currentLoginToken, err => {
          if (err) {
            this.makeClientLoggedOut();
          }
        });
      } else {
        this.logout();
      }
    }

    this._lastLoginTokenWhenPolled = currentLoginToken;
  }
});
