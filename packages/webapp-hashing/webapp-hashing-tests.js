const isHex40 = (s) => typeof s === "string" && /^[0-9a-f]{40}$/.test(s);

const makeResource = (overrides) => ({
  type: "js",
  replaceable: false,
  where: "client",
  path: "app.js",
  hash: "abc123",
  ...overrides,
});

const fixedOverride = { foo: "bar", baz: 42 };

Tinytest.add("webapp-hashing - calculateCordovaCompatibilityHash is deterministic", (test) => {
  const hash1 = WebAppHashing.calculateCordovaCompatibilityHash("6.0.0", {
    "cordova-plugin-camera": "4.0.0",
    "cordova-plugin-file": "6.0.0",
  });
  const hash2 = WebAppHashing.calculateCordovaCompatibilityHash("6.0.0", {
    "cordova-plugin-camera": "4.0.0",
    "cordova-plugin-file": "6.0.0",
  });

  test.isTrue(isHex40(hash1), "should return 40-char hex string");
  test.equal(hash1, hash2);
});

Tinytest.add(
  "webapp-hashing - calculateCordovaCompatibilityHash is order-independent for plugins",
  (test) => {
    const hashAB = WebAppHashing.calculateCordovaCompatibilityHash("6.0.0", {
      "plugin-a": "1.0.0",
      "plugin-b": "2.0.0",
    });
    const hashBA = WebAppHashing.calculateCordovaCompatibilityHash("6.0.0", {
      "plugin-b": "2.0.0",
      "plugin-a": "1.0.0",
    });

    test.equal(hashAB, hashBA, "plugin insertion order must not affect the hash");
  },
);

Tinytest.add(
  "webapp-hashing - calculateCordovaCompatibilityHash differs on input change",
  (test) => {
    const baseline = WebAppHashing.calculateCordovaCompatibilityHash("6.0.0", {
      "plugin-a": "1.0.0",
    });

    // Different platformVersion.
    const diffPlatform = WebAppHashing.calculateCordovaCompatibilityHash("6.0.1", {
      "plugin-a": "1.0.0",
    });
    test.notEqual(baseline, diffPlatform);

    // Different plugin version.
    const diffVersion = WebAppHashing.calculateCordovaCompatibilityHash("6.0.0", {
      "plugin-a": "1.0.1",
    });
    test.notEqual(baseline, diffVersion);

    // Different plugin name.
    const diffName = WebAppHashing.calculateCordovaCompatibilityHash("6.0.0", {
      "plugin-b": "1.0.0",
    });
    test.notEqual(baseline, diffName);
  },
);

Tinytest.add("webapp-hashing - calculateClientHash is deterministic", (test) => {
  const manifest = [makeResource({ path: "app.js", hash: "aaa" })];
  const hash1 = WebAppHashing.calculateClientHash(manifest, null, fixedOverride);
  const hash2 = WebAppHashing.calculateClientHash(manifest, null, fixedOverride);

  test.isTrue(isHex40(hash1));
  test.equal(hash1, hash2);
});

Tinytest.add("webapp-hashing - calculateClientHash ignores non-client resources", (test) => {
  const baseline = [makeResource({ path: "app.js", hash: "aaa" })];

  // Adding a server-only resource should not change the hash.
  const withServer = [
    ...baseline,
    makeResource({ path: "server.js", hash: "bbb", where: "server" }),
  ];
  test.equal(
    WebAppHashing.calculateClientHash(baseline, null, fixedOverride),
    WebAppHashing.calculateClientHash(withServer, null, fixedOverride),
  );

  // Adding a client resource SHOULD change the hash.
  const withClient = [
    ...baseline,
    makeResource({ path: "extra.js", hash: "ccc", where: "client" }),
  ];
  test.notEqual(
    WebAppHashing.calculateClientHash(baseline, null, fixedOverride),
    WebAppHashing.calculateClientHash(withClient, null, fixedOverride),
  );

  // Adding an internal resource SHOULD also change the hash.
  const withInternal = [
    ...baseline,
    makeResource({ path: "internal.js", hash: "ddd", where: "internal" }),
  ];
  test.notEqual(
    WebAppHashing.calculateClientHash(baseline, null, fixedOverride),
    WebAppHashing.calculateClientHash(withInternal, null, fixedOverride),
  );
});

Tinytest.add("webapp-hashing - calculateClientHash respects includeFilter", (test) => {
  const manifest = [
    makeResource({ type: "js", path: "app.js", hash: "aaa" }),
    makeResource({ type: "css", path: "app.css", hash: "bbb" }),
  ];

  const withCss = WebAppHashing.calculateClientHash(manifest, null, fixedOverride);
  const withoutCss = WebAppHashing.calculateClientHash(
    manifest,
    (type) => type !== "css",
    fixedOverride,
  );

  // The filter excludes css resources, so the resulting hash should differ.
  test.notEqual(withCss, withoutCss);

  // And it should equal the hash of just the js resource.
  const jsOnly = WebAppHashing.calculateClientHash(
    [makeResource({ type: "js", path: "app.js", hash: "aaa" })],
    null,
    fixedOverride,
  );
  test.equal(withoutCss, jsOnly);
});

Tinytest.add(
  "webapp-hashing - calculateClientHash reacts to runtimeConfigOverride changes",
  (test) => {
    const manifest = [makeResource({ path: "app.js", hash: "aaa" })];

    const hash1 = WebAppHashing.calculateClientHash(manifest, null, { foo: "bar" });
    const hash2 = WebAppHashing.calculateClientHash(manifest, null, { foo: "baz" });
    test.notEqual(hash1, hash2);

    // Same override → same hash.
    const hash1b = WebAppHashing.calculateClientHash(manifest, null, { foo: "bar" });
    test.equal(hash1, hash1b);
  },
);
