Package.describe({
  summary: "JavaScript minifier",
  version: "2.1.3"
});

Npm.depends({
  "uglify-es": "3.0.28"
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.export(['meteorJsMinify']);
  api.addFiles(['minifier.js'], 'server');
});
