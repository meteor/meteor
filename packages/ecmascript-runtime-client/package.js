Package.describe({
  name: "ecmascript-runtime-client",
  version: "0.4.3",
  summary: "Polyfills for new ECMAScript 2015 APIs like Map and Set",
  git: "https://github.com/meteor/meteor/tree/devel/packages/ecmascript-runtime-client",
  documentation: "README.md"
});

Package.onUse(function(api) {
  // If the es5-shim package is installed, make sure it loads before
  // ecmascript-runtime-server, since the runtime uses some ES5 APIs like
  // Object.defineProperties that are buggy in older browsers.
  api.use("es5-shim", { weak: true });
  api.use("modules", "client");
  api.use("promise", "client");
  api.mainModule("runtime.js", "client");
  api.export("Symbol", "client");
  api.export("Map", "client");
  api.export("Set", "client");
});
