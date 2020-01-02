Package.describe({
  summary: "JavaScript minifier",
  version: "2.6.0-rc190.2"
});

Npm.depends({
  terser: "4.4.0"
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.export(['meteorJsMinify']);
  api.addFiles(['minifier.js'], 'server');
});
