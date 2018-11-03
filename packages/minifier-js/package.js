Package.describe({
  summary: "JavaScript minifier",
  version: "2.4.0"
});

Npm.depends({
  terser: "3.9.2"
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.export(['meteorJsMinify']);
  api.addFiles(['minifier.js'], 'server');
});
