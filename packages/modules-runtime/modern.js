meteorInstall = makeInstaller({
  // On the client, make package resolution prefer the "browser" field of
  // package.json over the "module" field over the "main" field.
  browser: true,
  mainFields: ['browser', 'module', 'main'],

  fallback: function (id, parentId, error) {
    verifyErrors(id, parentId, error);
  }
});
