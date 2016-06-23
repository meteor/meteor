Package.describe({
  summary: "JavaScript minifier",
  version: "1.1.12_1"
});

Npm.depends({
  "uglify-js": "2.4.20",
});

Npm.strip({
  "uglify-js": ["test/"],
});

Package.onUse(function (api) {
  api.use('underscore', 'server');
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
