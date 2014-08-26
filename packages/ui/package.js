Package.describe({
  summary: "Meteor UI framework",
  version: '1.0.0'
});

Package.on_use(function (api) {
  api.use('blaze');
  api.imply('blaze');
});
