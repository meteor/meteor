Package.describe({
  summary: "Reactive dictionary",
  internal: true
});

Package.on_use(function (api, where) {
  where = where || ['client', 'server'];

  api.use(['underscore', 'deps', 'ejson'], where);
  api.add_files('reactive-dict.js', where);
});

Package.on_test(function (api) {
  api.use('tinytest');
});
