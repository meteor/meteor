Package.describe({
  summary: "JavaScript minifier",
  version: "2.4.1"
});

Npm.depends({
  terser: "3.16.1"
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.export(['meteorJsMinify']);
  api.addFiles(['minifier.js'], 'server');
});
