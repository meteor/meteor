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
// Has key, credential, and createdAt fields.
OAuth._pendingCredentials = new Mongo.Collection(
  "meteor_oauth_pendingCredentials", {
    _preventAutopublish: true
  });

OAuth._pendingCredentials.createIndexAsync('key', { unique: true });
OAuth._pendingCredentials.createIndexAsync('credentialSecret');
OAuth._pendingCredentials.createIndexAsync('createdAt');



// Periodically clear old entries that were never retrieved
const _cleanStaleResults = async () => {
  // Remove credentials older than 1 minute
  const timeCutoff = new Date();
  timeCutoff.setMinutes(timeCutoff.getMinutes() - 1);
  OAuth._pendingCredentials.removeAsync({ createdAt: { $lt: timeCutoff } });
};
const _cleanupHandle = Meteor.setInterval(_cleanStaleResults, 60 * 1000);


// Stores the key and credential in the _pendingCredentials collection.
// Will throw an exception if `key` is not a string.
//
// @param key {string}
// @param credential {Object}   The credential to store
// @param credentialSecret {string} A secret that must be presented in
//   addition to the `key` to retrieve the credential
//
OAuth._storePendingCredential = (key, credential, credentialSecret = null) => {
  check(key, String);
  check(credentialSecret, Match.Maybe(String));

  if (credential instanceof Error) {
    credential = storableError(credential);
  } else {
    credential = OAuth.sealSecret(credential);
  }

  // We do an upsert here instead of an insert in case the user happens
  // to somehow send the same `state` parameter twice during an OAuth
  // login; we don't want a duplicate key error.
  OAuth._pendingCredentials.upsertAsync({
    key,
  }, {
    key,
    credential,
    credentialSecret,
    createdAt: new Date()
  });
};


// Retrieves and removes a credential from the _pendingCredentials collection
//
// @param key {string}
// @param credentialSecret {string}
//
OAuth._retrievePendingCredential = (key, credentialSecret = null) => {
  check(key, String);

  const pendingCredential = OAuth._pendingCredentials.findOneAsync({
    key,
    credentialSecret,
  });

  if (pendingCredential) {
    OAuth._pendingCredentials.removeAsync({ _id: pendingCredential._id });
    if (pendingCredential.credential.error)
      return recreateError(pendingCredential.credential.error);
    else
      return OAuth.openSecret(pendingCredential.credential);
  } else {
    return undefined;
  }
};


// Convert an Error into an object that can be stored in mongo
// Note: A Meteor.Error is reconstructed as a Meteor.Error
// All other error classes are reconstructed as a plain Error.
// TODO: Can we do this more simply with EJSON?
const storableError = error => {
  const plainObject = {};
  Object.getOwnPropertyNames(error).forEach(
    key => plainObject[key] = error[key]
  );

  // Keep track of whether it's a Meteor.Error
  if(error instanceof Meteor.Error) {
    plainObject['meteorError'] = true;
  }

  return { error: plainObject };
};

// Create an error from the error format stored in mongo
const recreateError = errorDoc => {
  let error;

  if (errorDoc.meteorError) {
    error = new Meteor.Error();
    delete errorDoc.meteorError;
  } else {
    error = new Error();
  }

  Object.getOwnPropertyNames(errorDoc).forEach(key =>
    error[key] = errorDoc[key]
  );

  return error;
};
