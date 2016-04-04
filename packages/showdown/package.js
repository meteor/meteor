Package.describe({
  summary: "Moved to the 'markdown' package",
  version: '1.0.7'
});

Package.onUse(function (api) {
  api.imply("markdown");
});
