var crypto = require("crypto");
var gcmKey = null;
var OAuthEncryption = exports.OAuthEncryption = {};
var objToStr = Object.prototype.toString;

function isString(value) {
  return objToStr.call(value) === "[object String]";
}

// Node leniently ignores non-base64 characters when parsing a base64
// string, but we want to provide a more informative error message if
// the developer doesn't use base64 encoding.
//
// Note that an empty string is valid base64 (denoting 0 bytes).
//
// Exported for the convenience of tests.
//
OAuthEncryption._isBase64 = function (str) {
  return isString(str) && /^[A-Za-z0-9\+\/]*\={0,2}$/.test(str);
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

  var buf = Buffer.from(key, "base64");

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
// We might someday like the user id to be AAD (additional authenticated
// data), but the Node 0.10.x crypto API did not support specifying AAD,
// and it's not clear that we want to incur the compatibility issues of
// relying on that feature, even though it's now supported by Node 4.
//
OAuthEncryption.seal = function (data, userId) {
  if (! gcmKey) {
    throw new Error("No OAuth encryption key loaded");
  }

  var plaintext = Buffer.from(EJSON.stringify({
    data: data,
    userId: userId
  }));

  var iv = crypto.randomBytes(12);
  var cipher = crypto.createCipheriv("aes-128-gcm", gcmKey, iv);
  cipher.setAAD(Buffer.from([]));
  var chunks = [cipher.update(plaintext)];
  chunks.push(cipher.final());
  var encrypted = Buffer.concat(chunks);

  return {
    iv: iv.toString("base64"),
    ciphertext: encrypted.toString("base64"),
    algorithm: "aes-128-gcm",
    authTag: cipher.getAuthTag().toString("base64")
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
OAuthEncryption.open = function (ciphertext, userId) {
  if (! gcmKey)
    throw new Error("No OAuth encryption key loaded");

  try {
    if (ciphertext.algorithm !== "aes-128-gcm") {
      throw new Error();
    }

    var decipher = crypto.createDecipheriv(
      "aes-128-gcm",
      gcmKey,
      Buffer.from(ciphertext.iv, "base64")
    );

    decipher.setAAD(Buffer.from([]));
    decipher.setAuthTag(Buffer.from(ciphertext.authTag, "base64"));
    var chunks = [decipher.update(
      Buffer.from(ciphertext.ciphertext, "base64"))];
    chunks.push(decipher.final());
    var plaintext = Buffer.concat(chunks).toString("utf8");

    var err;
    var data;

    try {
      data = EJSON.parse(plaintext);
    } catch (e) {
      err = new Error();
    }

    if (data.userId !== userId) {
      err = new Error();
    }

    if (err) {
      throw err;
    } else {
      return data.data;
    }
  } catch (e) {
    throw new Error("decryption failed");
  }
};


OAuthEncryption.isSealed = function (maybeCipherText) {
  return maybeCipherText &&
    OAuthEncryption._isBase64(maybeCipherText.iv) &&
    OAuthEncryption._isBase64(maybeCipherText.ciphertext) &&
    OAuthEncryption._isBase64(maybeCipherText.authTag) &&
    isString(maybeCipherText.algorithm);
};


OAuthEncryption.keyIsLoaded = function () {
  return !! gcmKey;
};
