Package.describe({
  summary: "Reactive dictionary",
  version: '1.0.0'
});

Package.on_use(function (api) {
  api.use(['underscore', 'deps', 'ejson']);
  // If we are loading mongo-livedata, let you store ObjectIDs in it.
  api.use('mongo-livedata', {weak: true});
  api.export('ReactiveDict');
  api.add_files('reactive-dict.js');
});

Package.on_test(function (api) {
  api.use('tinytest');
});
