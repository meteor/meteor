Package.describe({
  summary: "Reactive dictionary",
  version: '1.1.10'
});

Package.onUse(function (api) {
  api.use(['underscore', 'tracker', 'ejson', 'ecmascript']);
  // If we are loading mongo-livedata, let you store ObjectIDs in it.
  api.use('mongo', {weak: true});
  api.mainModule('migration.js');
  api.export('ReactiveDict');
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('reactive-dict');
  api.use('tracker');
  api.use('underscore');
  api.use('reload');
  api.addFiles('reactive-dict-tests.js');
});
