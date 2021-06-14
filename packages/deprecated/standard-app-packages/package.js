Package.describe({
  summary: "Moved to meteor-platform",
  version: '1.0.9',
  deprecated: true
});

Package.onUse(function (api) {
  api.imply("meteor-platform");
});
