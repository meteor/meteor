var verifyErrors = Package['modules-runtime'].verifyErrors;

meteorInstall = makeInstaller({
  // On the client, make package resolution prefer the "browser" field of
  // package.json over the "module" field over the "main" field.
  browser: true,

  // The difference between legacy.js and modern.js is that this module
  // prefers "main" over "module" (see issue #10658).
  mainFields: ["browser", "main", "module"],

  fallback: function (id, parentId, error) {
    verifyErrors(id, parentId, error);
  }
});

var Module = Package['modules-runtime'].meteorInstall.Module;
meteorInstall.Module.prototype.link = Module.prototype.link;

// This package should be running after modules-runtime but before modules.
// We want modules to use our patched meteorInstall
Package['modules-runtime'].meteorInstall = meteorInstall;
