
Package.describe({
  summary: "Collection of helpers and selected underscore/lodash packages/",
  version: '1.0.0',
});

Npm.depends({
  '@types/lodash.template': '1.11.4',
  "lodash.template": "4.5.0"
});

Package.onUse(function (api) {
  api.use(['ecmascript', 'typescript']);

  api.addFile('./lodash.ts');
});


Package.onTest(function (api) {
  api.use('utilities');
});
