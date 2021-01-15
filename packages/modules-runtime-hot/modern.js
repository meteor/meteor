meteorInstall = makeInstaller({
  // On the client, make package resolution prefer the "browser" field of
  // package.json over the "module" field over the "main" field.
  browser: true,
  mainFields: ["browser", "module", "main"],

  fallback: function (id, parentId, error) {
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

let Module = Package['modules-runtime'].meteorInstall.Module;
meteorInstall.Module.prototype.link = Module.prototype.link;

// This package should be running after modules-runtime but before modules.
// We want modules to use our patched meteorInstall
Package['modules-runtime'].meteorInstall = meteorInstall;
