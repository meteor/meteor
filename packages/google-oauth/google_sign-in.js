var Google = require("./namespace.js");

var gplusPromise = new Promise(function (resolve, reject) {
  if (! Meteor.isCordova) {
    reject(new Error("plugins.googleplus requires Cordova"));
    return;
  }

  Meteor.startup(function () {
    var plugins = global.plugins;
    var gplus = plugins && plugins.googleplus;
    if (gplus) {
      resolve(gplus);
    } else {
      reject(new Error("plugins.googleplus not defined"));
    }
  });
});

function tolerateUnhandledRejection() {}
gplusPromise.catch(tolerateUnhandledRejection);

// After 20 April 2017, Google OAuth login will no longer work from a
// WebView, so Cordova apps must use Google Sign-In instead.
// https://github.com/meteor/meteor/issues/8253
exports.signIn = Google.signIn = function (options, callback) {
  // support a callback without options
  if (! callback && typeof options === "function") {
    callback = options;
    options = null;
  }

  gplusPromise.then(function (gplus) {
    var config = ServiceConfiguration.configurations.findOne({
      service: "google"
    });

    if (! config) {
      throw new ServiceConfiguration.ConfigError();
    }

    options = Object.assign(Object.create(null), options);

    gplus.login({
      scopes: getScopes(options).join(" "),
      webClientId: config.clientId,
      offline: true
    }, function (response) {
      Accounts.callLoginMethod({
        methodArguments: [Object.assign({
          googleSignIn: true
        }, response)],
        userCallback: callback
      });
    }, callback);

  }).catch(callback);
};

function getScopes(options) {
  // we need the email scope to get user id from google.
  var requiredScopes = { 'email': 1 };
  var scopes = options.requestPermissions || ['profile'];

  scopes.forEach(function (scope) {
    requiredScopes[scope] = 1;
  });

  return Object.keys(requiredScopes);
}

exports.signOut = Google.signOut = function () {
  return gplusPromise.then(function (gplus) {
    return new Promise(function (resolve) {
      gplus.logout(resolve);
    });
  });
};

// Make sure we don't stay logged in with Google Sign-In after the client
// calls Meteor.logout().
Meteor.startup(function () {
  Accounts.onLogout(function () {
    Google.signOut().catch(tolerateUnhandledRejection);
  });
});
