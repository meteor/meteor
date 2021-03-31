Tinytest.add("oauth-encryption - loadKey", test => {
  test.throws(
    () => OAuthEncryption.loadKey("my encryption key"),
    "The OAuth encryption key must be encoded in base64"
  );

  test.throws(
    () => OAuthEncryption.loadKey(Buffer.from([1, 2, 3, 4, 5])
      .toString("base64")),
    "The OAuth encryption AES-128-GCM key must be 16 bytes in length"
  );

  OAuthEncryption.loadKey(
    Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );

  OAuthEncryption.loadKey(null);
});

Tinytest.add("oauth-encryption - seal", test => {
  OAuthEncryption.loadKey(
    Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );

  const ciphertext = OAuthEncryption.seal({a: 1, b: 2});
  test.isTrue(Buffer.from(ciphertext.iv, "base64").length === 12);
  test.isTrue(OAuthEncryption._isBase64(ciphertext.ciphertext));
  test.isTrue(ciphertext.algorithm === "aes-128-gcm");
  test.isTrue(OAuthEncryption._isBase64(ciphertext.authTag));

  OAuthEncryption.loadKey(null);
});

Tinytest.add("oauth-encryption - open successful", test => {
  OAuthEncryption.loadKey(
    Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );
  const userId = "rH6rNSWd2hBTfkwcc";
  const ciphertext = OAuthEncryption.seal({a: 1, b: 2}, userId);

  const decrypted = OAuthEncryption.open(ciphertext, userId);
  test.equal(decrypted, {a: 1, b: 2});

  OAuthEncryption.loadKey(null);
});

Tinytest.add("oauth-encryption - open with wrong key", test => {
  OAuthEncryption.loadKey(
    Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );
  const userId = "rH6rNSWd2hBTfkwcc";
  const ciphertext = OAuthEncryption.seal({a: 1, b: 2}, userId);

  OAuthEncryption.loadKey(
    Buffer.from([9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]).
    toString("base64")
  );
  test.throws(
    () => OAuthEncryption.open(ciphertext, userId),
    "decryption failed"
  );

  OAuthEncryption.loadKey(null);
});

Tinytest.add("oauth-encryption - open with wrong userId", test => {
  OAuthEncryption.loadKey(
    Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );
  const userId = "rH6rNSWd2hBTfkwcc";
  const ciphertext = OAuthEncryption.seal({a: 1, b: 2}, userId);

  const differentUser = "3FPxY2mBNeBpigm86";
  test.throws(
    () => OAuthEncryption.open(ciphertext, differentUser),
    "decryption failed"
  );

  OAuthEncryption.loadKey(null);
});

Tinytest.add("oauth-encryption - seal and open with no userId", test => {
  OAuthEncryption.loadKey(
    Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );
  const ciphertext = OAuthEncryption.seal({a: 1, b: 2});
  const decrypted = OAuthEncryption.open(ciphertext);
  test.equal(decrypted, {a: 1, b: 2});
});

Tinytest.add("oauth-encryption - open modified ciphertext", test => {
  OAuthEncryption.loadKey(
    Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );
  const ciphertext = OAuthEncryption.seal({a: 1, b: 2});

  const b = Buffer.from(ciphertext.ciphertext, "base64");
  b[0] = b[0] ^ 1;
  ciphertext.ciphertext = b.toString("base64");

  test.throws(
    () => OAuthEncryption.open(ciphertext),
    "decryption failed"
  );
});


Tinytest.add("oauth-encryption - isSealed", test => {
  OAuthEncryption.loadKey(
    Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );
  const userId = "rH6rNSWd2hBTfkwcc";
  const ciphertext = OAuthEncryption.seal({a: 1, b: 2}, userId);
  test.isTrue(OAuthEncryption.isSealed(ciphertext));

  test.isFalse(OAuthEncryption.isSealed("abcdef"));
  test.isFalse(OAuthEncryption.isSealed({a: 1, b: 2}));

  OAuthEncryption.loadKey(null);
});

Tinytest.add("oauth-encryption - keyIsLoaded", test => {
  OAuthEncryption.loadKey(null);
  test.isFalse(OAuthEncryption.keyIsLoaded());

  OAuthEncryption.loadKey(
    Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]).
    toString("base64")
  );
  test.isTrue(OAuthEncryption.keyIsLoaded());

  OAuthEncryption.loadKey(null);
});
