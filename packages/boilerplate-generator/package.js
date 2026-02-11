Package.describe({
  summary: "Generates the boilerplate html from program's manifest",
  version: '2.1.0',
});

Npm.depends({
  "combined-stream2": "1.1.2"
});

Package.onUse(api => {
  api.use('ecmascript');
  api.mainModule('generator.js', 'server');
  api.export('Boilerplate', 'server');
});
