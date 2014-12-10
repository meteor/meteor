Package.describe({
  summary: "Moved to the 'markdown' package",
  version: '1.0.3-ipc.0'
});

Package.onUse(function (api) {
  api.imply("markdown");
});
