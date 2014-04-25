Package.describe({
  summary: "Observe changes to various sequence types such as arrays, cursors and objects",
  internal: true
});

Package.on_use(function (api) {
  api.use('deps');
  api.use('minimongo');  // for idStringify
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
