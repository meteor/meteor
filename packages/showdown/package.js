Package.describe({
  summary: "Moved to the 'markdown' package",
  version: '1.0.5-beta.16'
});

Package.onUse(function (api) {
  api.imply("markdown");
});
