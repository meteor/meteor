Package.describe({
  summary: "Generates the boilerplate html from program's manifest",
  version: '1.1.0'
});

var USE_OLD_BOILERPLATE_GENERATOR = true;
if(USE_OLD_BOILERPLATE_GENERATOR){
Package.onUse(function (api) {
  api.use([
    'underscore',
    'spacebars-compiler',
    'spacebars',
    'htmljs',
    'ui',
  ], 'server');
  api.addFiles(['boilerplate-generator-old.js'], 'server');
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
} else {

Package.onUse(function (api) {
  api.use([
    'underscore',
  ], 'server');
  api.addFiles([
    'boilerplate_web_template.js',
    'boilerplate-generator.js'
  ], 'server');
  api.export(['Boilerplate'], 'server');
});
}
