Package.describe({
  summary: "JavaScript and CSS minifiers",
  internal: true
});

Npm.depends({
  "clean-css": "1.1.2",
  // Fork of 2.4.0 fixing https://github.com/mishoo/UglifyJS2/pull/308
  "uglify-js": "https://github.com/meteor/UglifyJS2/tarball/bb0a762d12d2ecd058b9d7b57f16b4c289378d9c"
});

Package.on_use(function (api) {
  api.export(['CleanCSSProcess', 'UglifyJSMinify']);
  api.add_files('minifiers.js', 'server');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('minifiers');

  api.add_files(['beautify_tests.js'], 'server');
});
