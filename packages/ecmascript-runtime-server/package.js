Package.describe({
  name: "ecmascript-runtime-server",
  version: "0.4.1",
  summary: "Polyfills for new ECMAScript 2015 APIs like Map and Set",
  git: "https://github.com/meteor/meteor/tree/devel/packages/ecmascript-runtime-client",
  documentation: "README.md"
});

Npm.depends({
  "core-js": "2.4.1"
});

Package.onUse(function(api) {
  // If the es5-shim package is installed, make sure it loads before
  // ecmascript-runtime-server, since the runtime uses some ES5 APIs like
  // Object.defineProperties that are buggy in older browsers.
  api.use("es5-shim", { weak: true });
  api.use(["modules", "promise"], "server");
  api.mainModule("runtime.js", "server");
  api.export("Symbol", "server");
  api.export("Map", "server");
  api.export("Set", "server");
});
