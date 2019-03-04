Accounts.oauth.registerService('google');

if (Meteor.isClient) {
  const loginWithGoogle = (options, callback) => {
    // support a callback without options
    if (! callback && typeof options === "function") {
      callback = options;
      options = null;
    }

    if (Meteor.isCordova &&
        Google.signIn) {
      // After 20 April 2017, Google OAuth login will no longer work from
      // a WebView, so Cordova apps must use Google Sign-In instead.
      // https://github.com/meteor/meteor/issues/8253
      Google.signIn(options, callback);
      return;
    }

    // Use Google's domain-specific login page if we want to restrict creation to
    // a particular email domain. (Don't use it if restrictCreationByEmailDomain
    // is a function.) Note that all this does is change Google's UI ---
    // accounts-base/accounts_server.js still checks server-side that the server
    // has the proper email address after the OAuth conversation.
    if (typeof Accounts._options.restrictCreationByEmailDomain === 'string') {
      options = { ...options };
      options.loginUrlParameters = { ...options.loginUrlParameters };
      options.loginUrlParameters.hd = Accounts._options.restrictCreationByEmailDomain;
    }
    const credentialRequestCompleteCallback = Accounts.oauth.credentialRequestCompleteHandler(callback);
    Google.requestCredential(options, credentialRequestCompleteCallback);
  };
  Accounts.registerClientLoginFunction('google', loginWithGoogle);
  Meteor.loginWithGoogle = 
    (...args) => Accounts.applyLoginFunction('google', args);
} else {
  Accounts.addAutopublishFields({
    forLoggedInUser:
      // publish access token since it can be used from the client (if
      // transmitted over ssl or on
      // localhost). https://developers.google.com/accounts/docs/OAuth2UserAgent
      // refresh token probably shouldn't be sent down.
      Google.whitelistedFields.concat(['accessToken', 'expiresAt']).map(
        subfield => `services.google.${subfield}` // don't publish refresh token
      ), 

    forOtherUsers: 
      // even with autopublish, no legitimate web app should be
      // publishing all users' emails
      Google.whitelistedFields.filter(
        field => field !== 'email' && field !== 'verified_email'
      ).map(
        subfield => `services.google${subfield}`
      ),
  });
}
