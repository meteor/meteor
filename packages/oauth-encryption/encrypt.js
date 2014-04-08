var crypto = Npm.require("crypto");
// XXX We hope to be able to use the `crypto` module exclusively when
// it supports GCM.
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


var userIdToAAD = function (userId) {
  if (userId !== undefined)
    return new Buffer(EJSON.stringify({userId: userId}));
  else
    return new Buffer([]);
};


OAuthEncryption.seal = function (data, userId) {
  if (! gcmKey)
    throw new Error("No OAuth encryption key loaded");
  var plaintext = new Buffer(EJSON.stringify(data));
  var iv = crypto.randomBytes(12);
  var aad = userIdToAAD(userId);
  var result = gcm.encrypt(gcmKey, iv, plaintext, aad);
  return {
    iv: iv.toString("base64"),
    ciphertext: result.ciphertext.toString("base64"),
    algorithm: "aes-128-gcm",
    authTag: result.auth_tag.toString("base64")
  };
};

OAuthEncryption.open = function (ciphertext, userId) {
  if (! gcmKey)
    throw new Error("No OAuth encryption key loaded");

  if (ciphertext.algorithm !== "aes-128-gcm")
    throw new Error("unsupported algorithm");

  var result = gcm.decrypt(
    gcmKey,
    new Buffer(ciphertext.iv, "base64"),
    new Buffer(ciphertext.ciphertext, "base64"),
    userIdToAAD(userId),
    new Buffer(ciphertext.authTag, "base64")
  );

  // If we can't parse the decrypted text, it's probably because we
  // decrypted with the wrong key.  Check this before checking
  // auth_ok because if decryption fails then auth_ok will also be
  // false.
  var data;
  try {
    data = EJSON.parse(result.plaintext.toString());
  }
  catch (e) {
    if (e instanceof SyntaxError)
      throw new Error("OAuth decryption unsuccessful");
    else
      throw e;
  }

  if (! result.auth_ok)
    throw new Error("userId does not match in OAuth decryption");

  return data;
};


OAuthEncryption.isSealed = function (maybeCipherText) {
   return maybeCipherText &&
     OAuthEncryption._isBase64(maybeCipherText.iv) &&
     OAuthEncryption._isBase64(maybeCipherText.ciphertext) &&
     _.isString(maybeCipherText.algorithm);
};


OAuthEncryption.keyIsLoaded = function () {
  return !! gcmKey;
};
