Package.describe({
  summary: "An implementation of a diff algorithm on arrays and objects.",
  version: '1.1.4',
  documentation: null
});

Package.onUse(function (api) {
  api.use('meteor@2.1.1');
  api.use('ecmascript@0.16.13');
  api.use('ejson@1.3.0');
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
