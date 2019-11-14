Package.describe({
  summary: "JavaScript minifier",
  version: "2.5.0"
});

Npm.depends({
  terser: "4.3.1"
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.export(['meteorJsMinify']);
  api.addFiles(['minifier.js'], 'server');
});
