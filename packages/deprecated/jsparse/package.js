Package.describe({
  summary: "(Deprecated) Full-featured JavaScript parser",
  version: "2.0.0",
  deprecated: true
});

Package.onUse(function (api) {
  api.addFiles('deprecation_notice.js', 'server');
});
