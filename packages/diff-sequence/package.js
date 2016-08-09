Package.describe({
  summary: "An implementation of a diff algorithm on arrays and objects.",
  version: '1.0.6',
  documentation: null,
  git: 'https://github.com/meteor/meteor/tree/master/packages/diff-sequence'
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
