Package.describe({
  summary: "Moved to meteor-platform",
  version: '1.0.2'
});

Package.on_use(function (api) {
  api.imply("meteor-platform");
});
