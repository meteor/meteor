meteorInstall = makeInstaller({
  // On the client, make package resolution prefer the "browser" field of
  // package.json over the "module" field over the "main" field.
  browser: true,

  // The difference between legacy.js and modern.js is that this module
  // prefers "main" over "module" (see issue #10658).
  mainFields: ['browser', 'main', 'module'],
  conditions: ["module", "browser", "default"],

  fallback: function (id, parentId, error) {
    verifyErrors(id, parentId, error);
  }
});
