Package.describe({
  summary: "Observe changes to various sequence types such as arrays, cursors and objects",
  version: "1.0.16"
});

Package.onUse(function (api) {
  api.use('tracker@1.1.0');
  api.use('mongo-id@1.0.5');  // for idStringify
  api.use('diff-sequence@1.0.6');
  api.use('underscore@1.0.9');
  api.use('random@1.0.10');
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
