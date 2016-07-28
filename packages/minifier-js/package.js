Package.describe({
  summary: "JavaScript minifier",
  version: "1.2.13"
});

Npm.depends({
  "uglify-js": "https://github.com/mishoo/UglifyJS2/tarball/3f8fc3a316a60b67acf09b2b2cf887f0209c7d71"
});

Npm.strip({
  "uglify-js": ["test/"]
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
