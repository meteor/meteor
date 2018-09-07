Package.describe({
  name: "babel-runtime",
  summary: "Runtime support for output of Babel transpiler",
  version: '1.3.0-rc171.6',
  documentation: 'README.md'
});

Npm.depends({
  "meteor-babel-helpers": "0.0.3"
});

Package.onUse(function (api) {
  api.use("modules");
  api.mainModule("babel-runtime.js");
  api.export("meteorBabelHelpers");
});
