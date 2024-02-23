Package.describe({
  name: "modules",
  version: '0.19.1-beta300.4',
  summary: "CommonJS module system",
  documentation: "README.md"
});

Npm.depends({
  "@meteorjs/reify": "git+https://github.com/meteor/reify.git#cf61c57c6c4fefcbf164bf63d3c12fda1924b3d2",
  "meteor-babel-helpers": "0.0.3",
});

Package.onUse(function(api) {
  api.use("modules-runtime");
  api.use("modules-runtime-hot", { weak: true });
  api.mainModule("client.js", "client");
  api.mainModule("server.js", "server");
  api.export("meteorInstall");

  // When compiling legacy code, the babel-compiler and meteor-babel
  // packages assume meteorBabelHelpers.sanitizeForInObject is defined.
  // Since the modules package is responsible for code from node_modules,
  // it must also be responsible for exposing this runtime helper, but
  // only in the legacy bundle.
  api.addFiles("legacy.js", "legacy");
  api.export("meteorBabelHelpers", "legacy");
});
