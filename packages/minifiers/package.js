Package.describe({
  summary: "JavaScript and CSS minifiers",
  internal: true
});

Npm.depends({
  "clean-css": "2.0.2",
  "uglify-js": "2.4.7"
});

Package.on_use(function (api) {
  api.use('underscore');
  api.export(['CleanCSSProcess', 'UglifyJSMinify']);
  api.add_files('minifiers.js', 'server');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('minifiers');

  api.add_files(['beautify_tests.js', 'minifiers_tests.js'], 'server');
});
