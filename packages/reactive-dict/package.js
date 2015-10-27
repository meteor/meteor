Package.describe({
  summary: "Reactive dictionary",
  version: '1.1.3'
});

Package.onUse(function (api) {
  api.use(['underscore', 'tracker', 'ejson', 'ecmascript']);
  // If we are loading mongo-livedata, let you store ObjectIDs in it.
  api.use('mongo', {weak: true});
  api.export('ReactiveDict');
  api.addFiles('reactive-dict.js');
  api.addFiles('migration.js');
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('reactive-dict');
  api.use('tracker');
  api.use('underscore');
  api.addFiles('reactive-dict-tests.js');
});
