Package.describe({
  summary: "An implementation of a diff algorithm on arrays and objects.",
  version: '1.0.1',
  documentation: null
});

Package.onUse(function (api) {
  api.export('DiffSequence');
  api.use(['underscore', 'ejson']);
  api.addFiles([
    'diff.js'
  ]);
});

Package.onTest(function (api) {
  api.use([
    'tinytest',
    'underscore',
    'ejson'
  ]);

  api.use('diff-sequence');
  api.addFiles([
    'tests.js'
  ]);
});
