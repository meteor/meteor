Package.describe({
  summary: "JavaScript and CSS minifiers",
  version: "1.1.5"
});

Npm.depends({
  "uglify-js": "2.4.17",
  "css-parse": "https://github.com/reworkcss/css-parse/tarball/aa7e23285375ca621dd20250bac0266c6d8683a5",
  "css-stringify": "https://github.com/reworkcss/css-stringify/tarball/a7fe6de82e055d41d1c5923ec2ccef06f2a45efa"
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
