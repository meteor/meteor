Package.describe({
  name: 'caching-html-compiler',
  summary: "Pluggable class for compiling HTML into templates",
  version: '1.1.3',
  git: 'https://github.com/meteor/meteor.git'
});

Package.onUse(function (api) {
  api.use([
    'caching-compiler',
    'ecmascript'
  ]);

  api.export('CachingHtmlCompiler', 'server');

  api.addFiles([
    'caching-html-compiler.js'
  ], 'server');
});
