Package.describe({
  summary: "Moved to meteor-platform",
  version: '1.0.11-beta2140.7',
  deprecated: true,
  documentation: 'README.md'
});

Package.onUse(function (api) {
  api.imply("meteor-platform");
});
