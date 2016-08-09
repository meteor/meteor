Package.describe({
  summary: "Generates the boilerplate html from program's manifest",
  version: '1.0.9',
  git: 'https://github.com/meteor/meteor/tree/master/packages/boilerplate-generator'
});

Package.onUse(function (api) {
  api.use(['underscore',  'spacebars-compiler',
           'spacebars', 'htmljs', 'ui'], 'server');
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
