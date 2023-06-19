Package.describe({
  summary: "Reactive variable",
  version: '2.0.0-alpha300.10',
});

Package.onUse(function (api) {
  api.export('ReactiveVar');

  api.use('tracker');

  api.addFiles('reactive-var.js');
  api.addAssets('reactive-var.d.ts', 'server');
});
