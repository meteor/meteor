Package.describe({
  summary: "Moved to the 'markdown' package",
  version: '1.0.6-rc.2'
});

Package.onUse(function (api) {
  api.imply("markdown");
});
