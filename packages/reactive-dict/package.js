Package.describe({
  summary: "Reactive dictionary",
  internal: true
});

Package.on_use(function (api) {
  api.use(['underscore', 'deps', 'ejson']);
  api.exportSymbol('ReactiveDict');
  api.add_files('reactive-dict.js');
});

Package.on_test(function (api) {
  api.use('tinytest');
});
