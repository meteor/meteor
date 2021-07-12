Package.describe({
  summary: "JavaScript minifier",
  version: "2.6.1"
});

Npm.depends({
  terser: "4.8.0"
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.export(['meteorJsMinify']);
  api.addFiles(['minifier.js'], 'server');
});
