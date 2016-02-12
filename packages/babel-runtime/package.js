Package.describe({
  name: "babel-runtime",
  summary: "Runtime support for output of Babel transpiler",
  version: '0.1.5-cordova.5',
  documentation: 'README.md'
});

Package.onUse(function (api) {
  api.use("modules");
  api.addFiles("babel-runtime.js");
  api.export("meteorBabelHelpers");
});
