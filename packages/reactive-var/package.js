Package.describe({
  summary: "Reactive variable",
  version: '1.0.10-beta.1'
});

Package.onUse(function (api) {
  api.export('ReactiveVar');

  api.use('tracker');

  api.addFiles('reactive-var.js');
});
