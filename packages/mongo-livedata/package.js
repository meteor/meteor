Package.describe({
  summary: "Moved to the 'mongo' package",
  version: '1.0.7-win.0'
});

Package.on_use(function (api) {
  api.imply("mongo");
});
