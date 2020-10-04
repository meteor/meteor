import Google from './namespace.js';

const gplusPromise = new Promise((resolve, reject) => {
  if (! Meteor.isCordova) {
    reject(new Error("plugins.googleplus requires Cordova"));
    return;
  }

  Meteor.startup(() => {
    const { plugins } = global;
    const gplus = plugins && plugins.googleplus;
    if (gplus) {
      resolve(gplus);
    } else {
      reject(new Error("plugins.googleplus not defined"));
    }
  });
});

const tolerateUnhandledRejection = () => {};
gplusPromise.catch(tolerateUnhandledRejection);

// After 20 April 2017, Google OAuth login will no longer work from a
// WebView, so Cordova apps must use Google Sign-In instead.
// https://github.com/meteor/meteor/issues/8253
export const signIn = Google.signIn = (options, callback) => {
  // support a callback without options
  if (! callback && typeof options === "function") {
    callback = options;
    options = null;
  }

  gplusPromise.then(gplus => {
    const config = ServiceConfiguration.configurations.findOne({
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
    }, response => {
      Accounts.callLoginMethod({
        methodArguments: [Object.assign({
          googleSignIn: true
        }, response)],
        userCallback: callback
      });
    }, callback);

  }).catch(callback);
};

const getScopes = options => {
  // we need the email scope to get user id from google.
  const requiredScopes = { 'email': 1 };
  const scopes = options.requestPermissions || ['profile'];

  scopes.forEach(scope => requiredScopes[scope] = 1);

  return Object.keys(requiredScopes);
}

export const signOut = Google.signOut = () => 
  gplusPromise.then(gplus => 
    new Promise(resolve => 
      gplus.logout(resolve)
    )
  );

// Make sure we don't stay logged in with Google Sign-In after the client
// calls Meteor.logout().
Meteor.startup(() =>
  Accounts.onLogout(() =>
    Google.signOut().catch(tolerateUnhandledRejection)
  )
);
