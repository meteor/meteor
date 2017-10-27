Package.describe({
  summary: "JavaScript minifier",
  version: "2.2.0"
});

Npm.depends({
  "uglify-es": "3.0.28"
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.export(['meteorJsMinify']);
  api.addFiles(['minifier.js'], 'server');
});
