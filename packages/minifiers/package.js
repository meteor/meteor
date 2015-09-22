Package.describe({
  summary: "JavaScript and CSS minifiers",
  version: "1.1.7"
});

Npm.depends({
  "uglify-js": "2.4.20",
  "css-parse": "2.0.0",
  "css-stringify": "2.0.0"
});

Npm.strip({
  "uglify-js": ["test/"],
  "css-parse": ["test/"],
  "css-stringify": ["test/"]
});

Package.onUse(function (api) {
  api.use('underscore', 'server');
  api.export(['CssTools', 'UglifyJSMinify', 'UglifyJS']);
  api.addFiles(['minification.js', 'minifiers.js'], 'server');
});

Package.onTest(function (api) {
  api.use('minifiers', 'server');
  api.use('tinytest');

  api.addFiles([
    'beautify-tests.js',
    'minifiers-tests.js',
    'urlrewriting-tests.js'
  ], 'server');
});
