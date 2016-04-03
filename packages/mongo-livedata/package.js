Package.describe({
  summary: "Moved to the 'mongo' package",
  version: '1.0.11-rc.3'
});

Package.onUse(function (api) {
  api.imply("mongo");
});
