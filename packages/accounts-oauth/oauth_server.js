// Helper for registering OAuth based accounts packages.
// Adds an index to the user collection.
Accounts.oauth.registerService = function (name) {
  // Accounts.updateOrCreateUserFromExternalService does a lookup by this id,
  // so this should be a unique index. You might want to add indexes for other
  // fields returned by your service (eg services.github.login) but you can do
  // that in your app.
  Meteor.users._ensureIndex('services.' + name + '.id',
                            {unique: 1, sparse: 1});

};

// For test cleanup only. (Mongo has a limit as to how many indexes it can have
// per collection.)
Accounts.oauth._unregisterService = function (name) {
  var index = {};
  index['services.' + name + '.id'] = 1;
  Meteor.users._dropIndex(index);
};


// Listen to calls to `login` with an oauth option set. This is where
// users actually get logged in to meteor via oauth.
Accounts.registerLoginHandler(function (options) {
  if (!options.oauth)
    return undefined; // don't handle

  check(options.oauth, {credentialToken: String});

  if (!Oauth.hasCredential(options.oauth.credentialToken)) {
    // OAuth credentialToken is not recognized, which could be either because the popup
    // was closed by the user before completion, or some sort of error where
    // the oauth provider didn't talk to our server correctly and closed the
    // popup somehow.
    //
    // we assume it was user canceled, and report it as such, using a
    // Meteor.Error which the client can recognize. this will mask failures
    // where things are misconfigured such that the server doesn't see the
    // request but does close the window. This seems unlikely.
    throw new Meteor.Error(Accounts.LoginCancelledError.numericError,
                           'No matching login attempt found');
  }
  var result = Oauth.retrieveCredential(options.oauth.credentialToken);
  if (result instanceof Error)
    // We tried to login, but there was a fatal error. Report it back
    // to the user.
    throw result;
  else
    return Accounts.updateOrCreateUserFromExternalService(result.serviceName, result.serviceData, result.options);
});

