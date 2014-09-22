Package.describe({
  summary: "Observe changes to various sequence types such as arrays, cursors and objects",
  version: "1.0.2"
});

Package.on_use(function (api) {
  api.use('tracker');
  api.use('minimongo');  // for idStringify
  api.use('underscore');
  api.use('random');
  api.export('ObserveSequence');
  api.add_files(['observe_sequence.js']);
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('observe-sequence');
  api.use('underscore');
  api.use('ejson');
  api.add_files(['observe_sequence_tests.js'], 'client');
});
