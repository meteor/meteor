Package.describe({
  summary: "Moved to the 'mongo' package",
  version: '1.0.12'
});

Package.onUse(function (api) {
  api.imply("mongo");
});
