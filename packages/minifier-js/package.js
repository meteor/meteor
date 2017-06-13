Package.describe({
  summary: "JavaScript minifier",
  version: "2.1.1-beta.0"
});

Npm.depends({
  "uglify-js": "3.0.15"
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.export(['meteorJsMinify']);
  api.addFiles(['minifier.js'], 'server');
});
