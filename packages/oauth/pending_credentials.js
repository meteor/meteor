//
// When an oauth request is made, Meteor receives oauth credentials
// in one browser tab, and temporarily persists them while that
// tab is closed, then retrieves them in the browser tab that
// initiated the credential request.
//
// _pendingCredentials is the storage mechanism used to share the
// credential between the 2 tabs
//


// Collection containing pending credentials of oauth credential requests
// Has token, credential, and createdAt fields.
Oauth._pendingCredentials = new Meteor.Collection(
  "meteor_oauth_pendingCredentials", {
    _preventAutopublish: true
  });

Oauth._pendingCredentials._ensureIndex('token', {unique: 1});
Oauth._pendingCredentials._ensureIndex('createdAt');



// Periodically clear old entries that were never retrieved
var _cleanStaleResults = function() {
  // Remove credentials older than 1 minute
  var timeCutoff = new Date();
  timeCutoff.setMinutes(timeCutoff.getMinutes() - 1);
  Oauth._pendingCredentials.remove({ createdAt: { $lt: timeCutoff } });
};
var _cleanupHandle = Meteor.setInterval(_cleanStaleResults, 60 * 1000);


// Stores the token and credential in the _pendingCredentials collection
// XXX After oauth token encryption is added to Meteor, apply it here too
//
// @param credentialToken {string}
// @param credential {string}   The credential to store
//
Oauth._storePendingCredential = function (credentialToken, credential) {
  if (credential instanceof Error)
    credential = storableError(credential);

  Oauth._pendingCredentials.insert({
    token: credentialToken,
    credential: credential,
    createdAt: new Date()
  });
};


// Retrieves and removes a credential from the _pendingCredentials collection
// XXX After oauth token encryption is added to Meteor, apply it here too
//
// @param credentialToken {string}
//
Oauth._retrievePendingCredential = function (credentialToken) {
  check(credentialToken, String);

  var pendingCredential = Oauth._pendingCredentials.findOne({ token:credentialToken });
  if (pendingCredential) {
    Oauth._pendingCredentials.remove({ _id: pendingCredential._id });
    if (pendingCredential.credential.error)
      return recreateError(pendingCredential.credential.error);
    else
      return pendingCredential.credential;
  } else {
    return undefined;
  }
};


// Convert an Error into an object that can be stored in mongo
// Note: A Meteor.Error is reconstructed as a Meteor.Error
// All other error classes are reconstructed as a plain Error.
var storableError = function(error) {
  var plainObject = {};
  Object.getOwnPropertyNames(error).forEach(function(key) {
    plainObject[key] = error[key];
  });

  // Keep track of whether it's a Meteor.Error
  if(error instanceof Meteor.Error) {
    plainObject['meteorError'] = true;
  }

  return { error: plainObject };
};

// Create an error from the error format stored in mongo
var recreateError = function(errorDoc) {
  var error;

  if (errorDoc.meteorError) {
    error = new Meteor.Error();
    delete errorDoc.meteorErrror;
  } else {
    error = new Error();
  }

  Object.getOwnPropertyNames(errorDoc).forEach(function(key) {
    error[key] = errorDoc[key];
  });

  return error;
};
