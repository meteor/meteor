Package.describe({
  summary: "Reactive variable",
  version: '1.0.10',
  git: 'https://github.com/meteor/meteor/tree/master/packages/reactive-var'
});

Package.onUse(function (api) {
  api.export('ReactiveVar');

  api.use('tracker');

  api.addFiles('reactive-var.js');
});
