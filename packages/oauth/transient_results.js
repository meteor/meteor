if (typeof Oauth === 'undefined') {
  Oauth = {};
}

//
// When an oauth request is made, Meteor receives oauth credentials
// in one browser tab, and temporarily persists them while that
// tab is closed, then retrieves them in the browser tab that
// initiated the credential request.
//
// _transientResults is the storage mechanism used to share the
// result between the 2 tabs
//

// XXX we should periodically clear old entries


// Collection containing transient result of oauth credential requests
// Has token, result, at createdAt fields.
Oauth._transientResults = new Meteor.Collection(
  "meteor_oauth_transientResults", {
    _preventAutopublish: true
  });

Oauth._transientResults._ensureIndex('token', {unique: 1});


// Stores the token and result in the _transientResults collection
// XXX After oauth token encryption is added to Meteor, apply it here too
//
// @param credentialToken {string}
// @param result {string}   The result of the credential request
//
Oauth._storeTransientResult = function (credentialToken, result) {
  if (result instanceof Error)
    result = _storableError(result);

  Oauth._transientResults.insert({
    token: credentialToken,
    result: result,
    createdAt: new Date()
  });
};


// Retrieves and removes a result from the _transientResults collection
// XXX After oauth token encryption is added to Meteor, apply it here too
//
// @param credentialToken {string}
//
Oauth._retrieveTransientResult = function (credentialToken) {
  var transientResult = Oauth._transientResults.findOne({ token:credentialToken });
  if (transientResult) {
    Oauth._transientResults.remove({ _id: transientResult._id });
    if (transientResult.result.error)
      return _recreateError(transientResult.result.error);
    else
      return transientResult.result;
  } else {
    return undefined;
  }
};



var _storableError = function(error) {
  var plainObject = {};
  Object.getOwnPropertyNames(error).forEach(function(key) {
    plainObject[key] = error[key];
  });
  return { error: plainObject };
};

var _recreateError = function(errorDoc) {
  var error = new Error();
  Object.getOwnPropertyNames(errorDoc).forEach(function(key) {
    error[key] = errorDoc[key];
  });
  return error;
};
