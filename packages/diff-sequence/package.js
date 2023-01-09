Package.describe({
  summary: "An implementation of a diff algorithm on arrays and objects.",
  version: '1.1.2',
  documentation: null
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('ejson');
  api.mainModule('diff.js');
  api.export('DiffSequence');
});

Package.onTest(function (api) {
  api.use([
    'tinytest',
    'ejson'
  ]);

  api.use('diff-sequence');
  api.addFiles([
    'tests.js'
  ]);
});
