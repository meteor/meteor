Package.describe({
  summary: "Moved to the 'markdown' package",
  version: '1.0.8',
  git: 'https://github.com/meteor/meteor/tree/master/packages/showdown'
});

Package.onUse(function (api) {
  api.imply("markdown");
});
