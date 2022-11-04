Package.describe({
  summary: "Moved to the 'mongo' package",
  version: '1.0.12'
});

Package.onUse(function (api) {
  if (!process.env.DISABLE_FIBERS) {
    api.imply('mongo');
  } else {
    api.imply('mongo-async');
  }
});
