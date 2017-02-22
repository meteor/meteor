Package.describe({
  summary: "JavaScript minifier",
  version: "1.2.18"
});

Npm.depends({
  "uglify-js": "2.7.5"
});

Npm.strip({
  "uglify-js": ["test/"]
});

Package.onUse(function (api) {
  api.export(['UglifyJSMinify', 'UglifyJS']);
  api.addFiles(['minifier.js'], 'server');
});

Package.onTest(function (api) {
  api.use('minifier-js', 'server');
  api.use('tinytest');

  api.addFiles([
    'beautify-tests.js',
  ], 'server');
});
