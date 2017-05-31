Package.describe({
  summary: "JavaScript minifier",
  version: "2.1.0"
});

Npm.depends({
  "uglify-js": "3.0.13"
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.export(['meteorJsMinify']);
  api.addFiles(['minifier.js'], 'server');
});
