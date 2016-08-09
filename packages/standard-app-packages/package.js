Package.describe({
  summary: "Moved to meteor-platform",
  version: '1.0.9',
  git: 'https://github.com/meteor/meteor/tree/master/packages/standard-app-packages'
});

Package.onUse(function (api) {
  api.imply("meteor-platform");
});
