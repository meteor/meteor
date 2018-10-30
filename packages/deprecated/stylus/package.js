Package.describe({
  summary: 'Expressive, dynamic, robust CSS',
  version: "2.513.15"
});

Package.registerBuildPlugin({
  name: 'compileStylusBatch',
  use: ['ecmascript', 'caching-compiler'],
  sources: [
    'plugin/compile-stylus.js'
  ],
  npmDependencies: {
    stylus: "https://github.com/meteor/stylus/tarball/bb47a357d132ca843718c63998eb37b90013a449", // fork of 0.54.5
    nib: "1.1.2",
    "autoprefixer-stylus": "0.9.4"
  }
});

Package.onUse(function (api) {
  api.use('isobuild:compiler-plugin@1.0.0');
  api.addFiles("deprecation_notice.js");
});

Package.onTest(function (api) {
  api.use(['tinytest', 'stylus', 'test-helpers', 'templating']);
  api.addFiles([
    'stylus_tests.html',
    'stylus_tests.styl',
    'stylus_tests.import.styl',
    'stylus_tests.js'
  ],'client');
});
