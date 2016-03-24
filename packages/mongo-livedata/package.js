Package.describe({
  summary: "Moved to the 'mongo' package",
  version: '1.0.10-rc.10'
});

Package.onUse(function (api) {
  api.imply("mongo");
});
