Accounts.oauth.registerService('google');

Accounts.addAutopublishFields({
  forLoggedInUser: _.map(
    // publish access token since it can be used from the client (if
    // transmitted over ssl or on
    // localhost). https://developers.google.com/accounts/docs/OAuth2UserAgent
    // refresh token probably shouldn't be sent down.
    Google.whitelistedFields.concat(['accessToken', 'expiresAt']), // don't publish refresh token
    function (subfield) { return 'services.google.' + subfield; }),

  forOtherUsers: _.map(
    // even with autopublish, no legitimate web app should be
    // publishing all users' emails
    _.without(Google.whitelistedFields, 'email', 'verified_email'),
    function (subfield) { return 'services.google.' + subfield; })
});
