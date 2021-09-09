Package.describe({
  summary: "Moved to the 'markdown' package",
  version: '1.0.8',
  deprecated: true,
  documentation: 'README.md'
});

Package.onUse(function (api) {
  api.imply("markdown");
});
