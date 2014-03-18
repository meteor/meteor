// Listen to calls to `login` with an oauth option set. This is where
// users actually get logged in to meteor via oauth.
Accounts.registerLoginHandler(function (options) {
  if (!options.oauth)
    return undefined; // don't handle

  check(options.oauth, {credentialToken: String});

  if (!Oauth.hasCredential(options.oauth.credentialToken)) {
    // OAuth credentialToken is not recognized, which could be either
    // because the popup was closed by the user before completion, or
    // some sort of error where the oauth provider didn't talk to our
    // server correctly and closed the popup somehow.
    //
    // We assume it was user canceled and report it as such, using a
    // numeric code that the client recognizes (XXX this will get
    // replaced by a symbolic error code at some point
    // https://trello.com/c/kMkw800Z/53-official-ddp-specification). This
    // will mask failures where things are misconfigured such that the
    // server doesn't see the request but does close the window. This
    // seems unlikely.
    //
    // XXX we want `type` to be the service name such as "facebook"
    return { type: "oauth",
             error: new Meteor.Error(
               Accounts.LoginCancelledError.numericError, "Login canceled") };
  }
  var result = Oauth.retrieveCredential(options.oauth.credentialToken);
  if (result instanceof Error)
    // We tried to login, but there was a fatal error. Report it back
    // to the user.
    throw result;
  else
    return Accounts.updateOrCreateUserFromExternalService(result.serviceName, result.serviceData, result.options);
});
