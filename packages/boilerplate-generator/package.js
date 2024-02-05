Package.describe({
  summary: "Generates the boilerplate html from program's manifest",
  version: '1.7.2'
});

Npm.depends({
  "combined-stream2": "1.1.2",
  "lodash.template": "4.5.0"
});

Package.onUse(api => {
  api.use('ecmascript');
  api.mainModule('generator.js', 'server');
  api.export('Boilerplate', 'server');
});
