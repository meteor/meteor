Package.describe({
  summary: "JavaScript minifiers",
  version: "1.1.7"
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
  api.addFiles(['minifiers.js'], 'server');
});

Package.onTest(function (api) {
  api.use('minifiers-js', 'server');
  api.use('tinytest');

  api.addFiles([
    'beautify-tests.js',
  ], 'server');
});
