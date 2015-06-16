Package.describe({
  name: "linter-plugin",
  summary: "Use this package to enable Plugin.registerLinter",
  version: "1.0.0"
});

Package.onUse(function (api) {
  // XXX BBP add a use that forces you to be using a new enough version of
  // meteor.
  api.addFiles('enable-register-linter.js', 'server');
});
