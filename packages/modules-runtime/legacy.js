meteorInstall = makeInstaller({
  // On the client, make package resolution prefer the "browser" field of
  // package.json over the "module" field over the "main" field.
  browser: true,

  // The difference between legacy.js and modern.js is that this module
  // prefers "main" over "module" (see issue #10658).
  mainFields: ["browser", "main", "module"],

  fallback: function(id, parentId, error) {
    if (id && id.startsWith('meteor/')) {
      var packageName = id.split('/', 2)[1];
      throw new Error(
        'Cannot find package "' + packageName + '". ' +
          'Try "meteor add ' + packageName + '".'
      );
    }

    throw error;
  }
});
