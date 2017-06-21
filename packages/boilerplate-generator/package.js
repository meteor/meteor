Package.describe({
  summary: "Generates the boilerplate html from program's manifest",
  version: '1.1.0'
});

Package.onUse(api => {
  api.use('ecmascript');
  api.use([
    'underscore',
  ], 'server');
  api.mainModule('boilerplate-generator.js', 'server');
  api.export('Boilerplate', 'server');
});
