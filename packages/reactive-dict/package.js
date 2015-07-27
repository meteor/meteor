Package.describe({
  summary: "Reactive dictionary",
  version: '1.1.1-plugins.0'
});

Package.onUse(function (api) {
  api.use(['underscore', 'tracker', 'ejson']);
  // If we are loading mongo-livedata, let you store ObjectIDs in it.
  api.use('mongo', {weak: true});
  api.export('ReactiveDict');
  api.addFiles('reactive-dict.js');
  api.addFiles('migration.js');
});

Package.onTest(function (api) {
  api.use('tinytest');
  api.use('reactive-dict');
  api.addFiles('reactive-dict-tests.js');
});
