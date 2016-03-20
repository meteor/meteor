Package.describe({
  summary: "Moved to the 'markdown' package",
  version: '1.0.6-rc.4'
});

Package.onUse(function (api) {
  api.imply("markdown");
});
