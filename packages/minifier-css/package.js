Package.describe({
  summary: "CSS minifier",
  version: "1.2.16"
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
  api.addFiles(['minification.js', 'minifier.js'], 'server');
});

Package.onTest(function (api) {
  api.use('minifier-css', 'server');
  api.use('tinytest');

  api.addFiles([
    'minifier-tests.js',
    'urlrewriting-tests.js'
  ], 'server');
});
