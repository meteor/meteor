Package.describe({
  summary: "JavaScript minifier",
  version: "2.4.0-rc18.16"
});

Npm.depends({
  terser: "3.9.1"
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.export(['meteorJsMinify']);
  api.addFiles(['minifier.js'], 'server');
});
