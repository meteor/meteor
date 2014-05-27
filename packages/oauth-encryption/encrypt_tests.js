Tinytest.add("oauth-encryption - loadKey", function (test) {
  test.throws(
    function () {
      OAuthEncryption.loadKey("my encryption key");
    },
    "The OAuth encryption key must be encoded in base64"
  );

  test.throws(
    function () {
      OAuthEncryption.loadKey(new Buffer([1, 2, 3, 4, 5]).toString("base64"));
    },
    "The OAuth encryption AES-128-GCM key must be 16 bytes in length"
  );

  OAuthEncryption.loadKey(
    new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );

  OAuthEncryption.loadKey(null);
});

Tinytest.add("oauth-encryption - seal", function (test) {
  OAuthEncryption.loadKey(
    new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );

  var ciphertext = OAuthEncryption.seal({a: 1, b: 2});
  test.isTrue(new Buffer(ciphertext.iv, "base64").length === 12);
  test.isTrue(OAuthEncryption._isBase64(ciphertext.ciphertext));
  test.isTrue(ciphertext.algorithm === "aes-128-gcm");
  test.isTrue(OAuthEncryption._isBase64(ciphertext.authTag));

  OAuthEncryption.loadKey(null);
});

Tinytest.add("oauth-encryption - open successful", function (test) {
  OAuthEncryption.loadKey(
    new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );
  var userId = "rH6rNSWd2hBTfkwcc";
  var ciphertext = OAuthEncryption.seal({a: 1, b: 2}, userId);

  var decrypted = OAuthEncryption.open(ciphertext, userId);
  test.equal(decrypted, {a: 1, b: 2});

  OAuthEncryption.loadKey(null);
});

Tinytest.add("oauth-encryption - open with wrong key", function (test) {
  OAuthEncryption.loadKey(
    new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );
  var userId = "rH6rNSWd2hBTfkwcc";
  var ciphertext = OAuthEncryption.seal({a: 1, b: 2}, userId);

  OAuthEncryption.loadKey(
    new Buffer([9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]).
    toString("base64")
  );
  test.throws(
    function () {
      OAuthEncryption.open(ciphertext, userId);
    },
    "decryption failed"
  );

  OAuthEncryption.loadKey(null);
});

Tinytest.add("oauth-encryption - open with wrong userId", function (test) {
  OAuthEncryption.loadKey(
    new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );
  var userId = "rH6rNSWd2hBTfkwcc";
  var ciphertext = OAuthEncryption.seal({a: 1, b: 2}, userId);

  var differentUser = "3FPxY2mBNeBpigm86";
  test.throws(
    function () {
      OAuthEncryption.open(ciphertext, differentUser);
    },
    "decryption failed"
  );

  OAuthEncryption.loadKey(null);
});

Tinytest.add("oauth-encryption - seal and open with no userId", function (test) {
  OAuthEncryption.loadKey(
    new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );
  var ciphertext = OAuthEncryption.seal({a: 1, b: 2});
  var decrypted = OAuthEncryption.open(ciphertext);
  test.equal(decrypted, {a: 1, b: 2});
});

Tinytest.add("oauth-encryption - open modified ciphertext", function (test) {
  OAuthEncryption.loadKey(
    new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );
  var ciphertext = OAuthEncryption.seal({a: 1, b: 2});

  var b = new Buffer(ciphertext.ciphertext, "base64");
  b[0] = b[0] ^ 1;
  ciphertext.ciphertext = b.toString("base64");

  test.throws(
    function () {
      OAuthEncryption.open(ciphertext);
    },
    "decryption failed"
  );
});


Tinytest.add("oauth-encryption - isSealed", function (test) {
  OAuthEncryption.loadKey(
    new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );
  var userId = "rH6rNSWd2hBTfkwcc";
  var ciphertext = OAuthEncryption.seal({a: 1, b: 2}, userId);
  test.isTrue(OAuthEncryption.isSealed(ciphertext));

  test.isFalse(OAuthEncryption.isSealed("abcdef"));
  test.isFalse(OAuthEncryption.isSealed({a: 1, b: 2}));

  OAuthEncryption.loadKey(null);
});

Tinytest.add("oauth-encryption - keyIsLoaded", function (test) {
  OAuthEncryption.loadKey(null);
  test.isFalse(OAuthEncryption.keyIsLoaded());

  OAuthEncryption.loadKey(
    new Buffer([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );
  test.isTrue(OAuthEncryption.keyIsLoaded());

  OAuthEncryption.loadKey(null);
});
