Package.describe({
  summary: "Reactive dictionary",
  version: '1.3.0'
});

Package.onUse(function (api) {
  api.use(['tracker', 'ejson', 'ecmascript']);
  // If we are loading mongo-livedata, let you store ObjectIDs in it.
  api.use(['mongo', 'reload'], { weak: true });
  api.mainModule('migration.js');
  api.export('ReactiveDict');
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('reactive-dict');
  api.use('tracker');
  api.use('reload');
  api.addFiles('reactive-dict-tests.js');
});
