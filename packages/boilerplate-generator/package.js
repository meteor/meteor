Package.describe({
  summary: "Generates the boilerplate html from program's manifest",
  version: '1.0.12'
});

Package.onUse(function (api) {
  api.use([
    'underscore@1.0.9',
    'spacebars-compiler@1.0.13',
    'spacebars@1.0.13',
    'htmljs@1.0.11',
    'ui@1.0.12',
  ], 'server');
  api.addFiles(['boilerplate-generator.js'], 'server');
  api.export(['Boilerplate'], 'server');
  // These are spacebars templates, but we process them manually with the
  // spacebars compiler rather than letting the 'templating' package (which
  // isn't fully supported on the server yet) handle it. That also means that
  // they don't contain the outer "<template>" tag.
  api.addAssets([
    'boilerplate_web.browser.html',
    'boilerplate_web.cordova.html'
  ], 'server');
});
