Package.describe({
  summary: "JavaScript and CSS minifiers",
  internal: true
});

Npm.depends({
  "uglify-js": "2.4.7",
  "css-parse": "1.7.0",
  "css-stringify": "1.4.1"
});

Package.on_use(function (api) {
  api.use('underscore', 'server');
  api.export(['CssTools', 'UglifyJSMinify']);
  api.add_files(['minification.js', 'minifiers.js'], 'server');
});

Package.on_test(function (api) {
  api.use('minifiers', 'server');
  api.use('tinytest');
  api.add_files('minifiers-tests.js', 'server');
});

