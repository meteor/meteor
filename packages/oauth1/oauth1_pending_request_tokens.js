//
// _pendingRequestTokens are request tokens that have been received
// but not yet fully authorized (processed).
//
// During the oauth1 authorization process, the Meteor App opens
// a pop-up, requests a request token from the oauth1 service, and
// redirects the browser to the oauth1 service for the user
// to grant authorization.  The user is then returned to the
// Meteor Apps' callback url and the request token is verified.
//
// When Meteor Apps run on multiple servers, it's possible that
// 2 different servers may be used to generate the request token
// and to verify it in the callback once the user has authorized.
//
// For this reason, the _pendingRequestTokens are stored in the database
// so they can be shared across Meteor App servers.
//
// XXX This code is fairly similar to oauth/pending_credentials.js --
// maybe we can combine them somehow.

// Collection containing pending request tokens
// Has key, requestToken, requestTokenSecret, and createdAt fields.
OAuth._pendingRequestTokens = new Mongo.Collection(
  "meteor_oauth_pendingRequestTokens", {
    _preventAutopublish: true
  });

await OAuth._pendingRequestTokens.createIndexAsync('key', { unique: true });
await OAuth._pendingRequestTokens.createIndexAsync('createdAt');



// Periodically clear old entries that never got completed
const _cleanStaleResults = async () => {
  // Remove request tokens older than 5 minute
  const timeCutoff = new Date();
  timeCutoff.setMinutes(timeCutoff.getMinutes() - 5);
  await OAuth._pendingRequestTokens.removeAsync({ createdAt: { $lt: timeCutoff } });
};
const _cleanupHandle = Meteor.setInterval(_cleanStaleResults, 60 * 1000);


// Stores the key and request token in the _pendingRequestTokens collection.
// Will throw an exception if `key` is not a string.
//
// @param key {string}
// @param requestToken {string}
// @param requestTokenSecret {string}
//
OAuth._storeRequestToken = async (key, requestToken, requestTokenSecret) => {
  check(key, String);

  // We do an upsert here instead of an insert in case the user happens
  // to somehow send the same `state` parameter twice during an OAuth
  // login; we don't want a duplicate key error.
  await OAuth._pendingRequestTokens.upsertAsync({
    key,
  }, {
    key,
    requestToken: OAuth.sealSecret(requestToken),
    requestTokenSecret: OAuth.sealSecret(requestTokenSecret),
    createdAt: new Date()
  });
};


// Retrieves and removes a request token from the _pendingRequestTokens collection
// Returns an object containing requestToken and requestTokenSecret properties
//
// @param key {string}
//
OAuth._retrieveRequestToken = async key => {
  check(key, String);

  const pendingRequestToken =  await OAuth._pendingRequestTokens.findOneAsync({ key: key });
  if (pendingRequestToken) {
    await OAuth._pendingRequestTokens.removeAsync({ _id: pendingRequestToken._id });
    return {
      requestToken: OAuth.openSecret(pendingRequestToken.requestToken),
      requestTokenSecret: OAuth.openSecret(
        pendingRequestToken.requestTokenSecret)
    };
  } else {
    return undefined;
  }
};
