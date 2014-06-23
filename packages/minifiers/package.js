Package.describe({
  summary: "JavaScript and CSS minifiers",
  internal: true
});

Npm.depends({
  "uglify-js": "2.4.13",
  "css-parse": "https://github.com/reworkcss/css-parse/tarball/aa7e23285375ca621dd20250bac0266c6d8683a5",
  "css-stringify": "https://github.com/reworkcss/css-stringify/tarball/a7fe6de82e055d41d1c5923ec2ccef06f2a45efa"
});

Package.on_use(function (api) {
  api.use('underscore', 'server');
  api.export(['CssTools', 'UglifyJSMinify']);
  api.add_files(['minification.js', 'minifiers.js'], 'server');
});

Package.on_test(function (api) {
  api.use('minifiers', 'server');
  api.use('tinytest');

  api.add_files([
    'beautify-tests.js',
    'minifiers-tests.js',
    'urlrewriting-tests.js'
  ], 'server');
});
