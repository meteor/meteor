Package.describe({
  summary: "JavaScript minifier",
  version: "2.0.0"
});

Package.onUse(function (api) {
  api.use('babel-compiler');
  api.export(['meteorBabelMinify']);
  api.addFiles(['minifier.js'], 'server');
});
