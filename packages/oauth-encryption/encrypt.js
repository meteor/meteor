var crypto = Npm.require("crypto");
// XXX We hope to be able to use the `crypto` module exclusively when
// Node supports GCM in version 0.11.
var gcm = Npm.require("node-aes-gcm");

OAuthEncryption = {};

var gcmKey = null;


// Node leniently ignores non-base64 characters when parsing a base64
// string, but we want to provide a more informative error message if
// the developer doesn't use base64 encoding.
//
// Note that an empty string is valid base64 (denoting 0 bytes).
//
// Exported for the convenience of tests.
//
OAuthEncryption._isBase64 = function (str) {
  return _.isString(str) && /^[A-Za-z0-9\+\/]*\={0,2}$/.test(str);
};


// Loads the OAuth secret key, which must be 16 bytes in length
// encoded in base64.
//
// The key may be `null` which reverts to having no key (mainly used
// by tests).
//
OAuthEncryption.loadKey = function (key) {
  if (key === null) {
    gcmKey = null;
    return;
  }

  if (! OAuthEncryption._isBase64(key))
    throw new Error("The OAuth encryption key must be encoded in base64");

  var buf = new Buffer(key, "base64");

  if (buf.length !== 16)
    throw new Error("The OAuth encryption AES-128-GCM key must be 16 bytes in length");

  gcmKey = buf;
};


// Encrypt `data`, which may be any EJSON-compatible object, using the
// previously loaded OAuth secret key.
//
// The `userId` argument is optional. The data is encrypted as { data:
// *, userId: * }. When the result of `seal` is passed to `open`, the
// same user id must be supplied, which prevents user specific
// credentials such as access tokens from being used by a different
// user.
//
// We would actually like the user id to be AAD (additional
// authenticated data), but the node crypto API does not currently have
// support for specifying AAD.
//
OAuthEncryption.seal = function (data, userId) {
  if (! gcmKey) {
    throw new Error("No OAuth encryption key loaded");
  }

  var plaintext = new Buffer(EJSON.stringify({
    data: data,
    userId: userId
  }));
  var iv = crypto.randomBytes(12);
  var result = gcm.encrypt(gcmKey, iv, plaintext, new Buffer([]) /* aad */);
  return {
    iv: iv.toString("base64"),
    ciphertext: result.ciphertext.toString("base64"),
    algorithm: "aes-128-gcm",
    authTag: result.auth_tag.toString("base64")
  };
};

// Decrypt the passed ciphertext (as returned from `seal`) using the
// previously loaded OAuth secret key.
//
// `userId` must match the user id passed to `seal`: if the user id
// wasn't specified, it must not be specified here, if it was
// specified, it must be the same user id.
//
// To prevent an attacker from breaking the encryption key by
// observing the result of sending manipulated ciphertexts, `open`
// throws "decryption unsuccessful" on any error.
//
// For developers working on new code which uses oauth-encryption
// (such as working on a new login service), it's painful not to be
// able to see the actual cause of failure.  Setting
// `Meteor._printDecryptionFailure` displays the reason the decryption
// failed.  This should never be set in production.  (Developers who
// are simply using existing oauth and accounts packages wouldn't need
// to use this).
//
// XXX `Meteor._printDecryptionFailure` parallels livedata's
// `Meteor._printSentDDP` and `Meteor._printReceivedDDP`: debugging
// utilities very useful for development but ones we wouldn't want to
// run in production.  We might like to have an API such as
// `Meteor.dev` which would be guaranteed to be an empty
// object in production.
//
OAuthEncryption.open = function (ciphertext, userId) {
  if (! gcmKey)
    throw new Error("No OAuth encryption key loaded");

  try {
    if (ciphertext.algorithm !== "aes-128-gcm") {
      if (Meteor._printDecryptionFailure)
        Meteor._debug("unsupported algorithm in OAuth ciphertext");
      throw new Error();
    }

    var result = gcm.decrypt(
      gcmKey,
      new Buffer(ciphertext.iv, "base64"),
      new Buffer(ciphertext.ciphertext, "base64"),
      new Buffer([]),
      new Buffer(ciphertext.authTag, "base64")
    );

    if (! result.auth_ok) {
      if (Meteor._printDecryptionFailure) {
        Meteor._debug("OAuth decryption unsuccessful");
      }
      throw new Error();
    }

    var data;
    try {
      data = EJSON.parse(result.plaintext.toString());
    } catch (e) {
      if (e instanceof SyntaxError && Meteor._printDecryptionFailure) {
        Meteor._debug("OAuth decryption unsuccessful");
      }
      throw new Error();
    }

    if (data.userId !== userId) {
      throw new Error();
    }

    return data.data;
  } catch (e) {
    throw new Error("decryption failed");
  }
};


OAuthEncryption.isSealed = function (maybeCipherText) {
  return maybeCipherText &&
    OAuthEncryption._isBase64(maybeCipherText.iv) &&
    OAuthEncryption._isBase64(maybeCipherText.ciphertext) &&
    OAuthEncryption._isBase64(maybeCipherText.authTag) &&
    _.isString(maybeCipherText.algorithm);
};


OAuthEncryption.keyIsLoaded = function () {
  return !! gcmKey;
};
