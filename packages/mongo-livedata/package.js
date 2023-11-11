Package.describe({
  summary: "Moved to the 'mongo' package",
  version: '1.0.13-alpha300.17'
});

Package.onUse(function (api) {
  api.imply("mongo");
});
