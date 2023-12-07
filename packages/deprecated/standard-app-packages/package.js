Package.describe({
  summary: "Moved to meteor-platform",
  version: '1.0.11-rc2140.0',
  deprecated: true,
  documentation: 'README.md'
});

Package.onUse(function (api) {
  api.imply("meteor-platform");
});
