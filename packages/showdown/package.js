Package.describe({
  summary: "Moved to the 'markdown' package",
  version: '1.0.2-pre.2'
});

Package.on_use(function (api) {
  api.imply("markdown");
});
