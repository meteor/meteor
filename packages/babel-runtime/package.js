Package.describe({
  name: "babel-runtime",
  summary: "Runtime support for output of Babel transpiler",
  version: "0.1.5-modules.6",
  documentation: "README.md"
});

Npm.depends({
  "regenerator": "0.8.42"
});

Package.onUse(function (api) {
  api.use("modules");
  api.addFiles("babel-runtime.js");
  api.export("meteorBabelHelpers");
});
