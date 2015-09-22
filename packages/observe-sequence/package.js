Package.describe({
  summary: "Observe changes to various sequence types such as arrays, cursors and objects",
  version: "1.0.7"
});

Package.onUse(function (api) {
  api.use('tracker');
  api.use('mongo-id');  // for idStringify
  api.use('diff-sequence');
  api.use('underscore');
  api.use('random');
  api.export('ObserveSequence');
  api.addFiles(['observe_sequence.js']);
});

Package.onTest(function (api) {
  api.use([
    'tinytest',
    'observe-sequence',
    'underscore',
    'ejson',
    'tracker',
    'mongo'
  ]);

  api.addFiles(['observe_sequence_tests.js'], 'client');
});
