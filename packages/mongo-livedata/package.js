Package.describe({
  summary: "Moved to the 'mongo' package",
  version: '1.0.9-beta.15'
});

Package.onUse(function (api) {
  api.imply("mongo");
});
