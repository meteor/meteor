Package.describe({
  summary: "JavaScript minifier",
  version: "2.1.1"
});

Npm.depends({
  "uglify-js": "3.0.18"
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.export(['meteorJsMinify']);
  api.addFiles(['minifier.js'], 'server');
});
