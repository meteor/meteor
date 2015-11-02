Package.describe({
  summary: "JavaScript and CSS minifiers",
  version: "1.1.7"
});

Npm.depends({
  "css-parse": "2.0.0",
  "css-stringify": "2.0.0"
});

Npm.strip({
  "css-parse": ["test/"],
  "css-stringify": ["test/"]
});

Package.onUse(function (api) {
  api.use('underscore', 'server');
  api.export(['CssTools']);
  api.addFiles(['minification.js', 'minifiers.js'], 'server');
});

Package.onTest(function (api) {
  api.use('minifiers-css', 'server');
  api.use('tinytest');

  api.addFiles([
    'minifiers-tests.js',
    'urlrewriting-tests.js'
  ], 'server');
});
