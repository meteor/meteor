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
OAuth._pendingCredentials = new Meteor.Collection(
  "meteor_oauth_pendingCredentials", {
    _preventAutopublish: true
  });

OAuth._pendingCredentials._ensureIndex('token', {unique: 1});
OAuth._pendingCredentials._ensureIndex('createdAt');



// Periodically clear old entries that were never retrieved
var _cleanStaleResults = function() {
  // Remove credentials older than 1 minute
  var timeCutoff = new Date();
  timeCutoff.setMinutes(timeCutoff.getMinutes() - 1);
  OAuth._pendingCredentials.remove({ createdAt: { $lt: timeCutoff } });
};
var _cleanupHandle = Meteor.setInterval(_cleanStaleResults, 60 * 1000);


var OAuthEncryption = Package["oauth-encryption"] && Package["oauth-encryption"].OAuthEncryption;

var usingOAuthEncryption = function () {
  return OAuthEncryption && OAuthEncryption.keyIsLoaded();
};

// Return a copy of the service data with field values of
// `{seal: plaintext}` replaced with the encrypted ciphertext, using
// the user id as the additional authenticated data when provided.
//
// If oauth encryption is not being used, `{seal: plaintext}` is
// simply replaced with the plaintext.
//
var sealSecrets = function (plaintextServiceData, userId) {
  var result = {};
  _.map(plaintextServiceData, function (value, key) {
    if (value && value.seal)
      if (usingOAuthEncryption())
        value = OAuthEncryption.seal(value.seal, userId);
      else
        value = value.seal;
    result[key] = value;
  });
  return result;
};


// Stores the token and credential in the _pendingCredentials collection
//
// @param credentialToken {string}
// @param credential {string}   The credential to store
//
OAuth._storePendingCredential = function (credentialToken, credential) {
  if (credential instanceof Error)
    credential = storableError(credential);

  if (credential.serviceData)
    credential.serviceData = sealSecrets(credential.serviceData);

  OAuth._pendingCredentials.insert({
    token: credentialToken,
    credential: credential,
    createdAt: new Date()
  });
};


// Retrieves and removes a credential from the _pendingCredentials collection
//
// @param credentialToken {string}
//
OAuth._retrievePendingCredential = function (credentialToken) {
  check(credentialToken, String);

  var pendingCredential = OAuth._pendingCredentials.findOne({ token:credentialToken });
  if (pendingCredential) {
    OAuth._pendingCredentials.remove({ _id: pendingCredential._id });
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
    delete errorDoc.meteorError;
  } else {
    error = new Error();
  }

  Object.getOwnPropertyNames(errorDoc).forEach(function(key) {
    error[key] = errorDoc[key];
  });

  return error;
};
