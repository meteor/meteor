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


// Collection containing pending request tokens
// Has key, requestToken, requestTokenSecret, and createdAt fields.
Oauth._pendingRequestTokens = new Meteor.Collection(
  "meteor_oauth_pendingRequestTokens", {
    _preventAutopublish: true
  });

Oauth._pendingRequestTokens._ensureIndex('key', {unique: 1});
Oauth._pendingRequestTokens._ensureIndex('createdAt');



// Periodically clear old entries that never got completed
var _cleanStaleResults = function() {
  // Remove request tokens older than 5 minute
  var timeCutoff = new Date();
  timeCutoff.setMinutes(timeCutoff.getMinutes() - 5);
  Oauth._pendingRequestTokens.remove({ createdAt: { $lt: timeCutoff } });
};
var _cleanupHandle = Meteor.setInterval(_cleanStaleResults, 60 * 1000);


// Stores the key and request token in the _pendingRequestTokens collection
//
// @param key {string}
// @param requestToken {string}
// @param requestTokenSecret {string}
//
Oauth._storeRequestToken = function (key, requestToken, requestTokenSecret) {
  Oauth._pendingRequestTokens.insert({
    key: key,
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
Oauth._retrieveRequestToken = function (key) {
  check(key, String);

  var pendingRequestToken = Oauth._pendingRequestTokens.findOne({ key: key });
  if (pendingRequestToken) {
    Oauth._pendingRequestTokens.remove({ _id: pendingRequestToken._id });
    return {
      requestToken: OAuth.openSecret(pendingRequestToken.requestToken),
      requestTokenSecret: OAuth.openSecret(
        pendingRequestToken.requestTokenSecret)
    };
  } else {
    return undefined;
  }
};
