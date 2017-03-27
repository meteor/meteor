Package.describe({
  summary: "JavaScript minifier",
  version: "2.0.0-rc.1"
});

Npm.depends({
  "uglify-js": "2.8.16"
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.export(['meteorJsMinify']);
  api.addFiles(['minifier.js'], 'server');
});
