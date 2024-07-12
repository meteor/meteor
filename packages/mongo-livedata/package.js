Package.describe({
  summary: "Moved to the 'mongo' package",
  version: '1.0.13-rc300.8',
});

Package.onUse(function (api) {
  api.imply("mongo");
});
