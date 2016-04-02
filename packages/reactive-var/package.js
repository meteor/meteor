Package.describe({
  summary: "Reactive variable",
  version: '1.0.8-rc.0'
});

Package.onUse(function (api) {
  api.export('ReactiveVar');

  api.use('tracker');

  api.addFiles('reactive-var.js');
});
