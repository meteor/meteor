Package.describe({
  summary: "Moved to the 'mongo' package",
  version: '1.0.12',
  git: 'https://github.com/meteor/meteor/tree/master/packages/mongo-livedata'
});

Package.onUse(function (api) {
  api.imply("mongo");
});
