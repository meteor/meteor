Package.describe({
  summary: "An implementation of a diff algorithm on arrays and objects.",
  version: '1.1.3',
  documentation: null
});

Package.onUse(function (api) {
  api.use('ecmascript');
  api.use('harry97:cbor@1.1.16');
  api.mainModule('diff.js');
  api.export('DiffSequence');
});

Package.onTest(function (api) {
  api.use([
    'tinytest',
    'harry97:cbor@1.1.16'
  ]);

  api.use('diff-sequence');
  api.addFiles([
    'tests.js'
  ]);
});
