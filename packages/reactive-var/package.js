Package.describe({
  summary: "Reactive variable",
  version: '1.0.3'
});

Package.on_use(function (api) {
  api.export('ReactiveVar');

  api.use('tracker');

  api.add_files('reactive-var.js');
});
