Package.describe({
  summary: "Moved to the 'markdown' package",
  version: '1.0.5'
});

Package.onUse(function (api) {
  api.imply("markdown");
});
