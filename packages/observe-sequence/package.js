Package.describe({
  summary: "Observe changes to various sequence types such as arrays, cursors and objects",
  internal: true
});

Package.on_use(function (api) {
  api.use('deps');
  api.export('ObserveSequence');
  // XXX this does also run on the server but as logs as deps is not
  // documented to run there let's not try
  api.add_files(['observe_sequence.js'], 'client');
});

Package.on_test(function (api) {
  api.use('tinytest');
  api.use('observe-sequence');
  api.use('underscore');
  api.use('ejson');
  api.add_files(['observe_sequence_tests.js'], 'client');
});
