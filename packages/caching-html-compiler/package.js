Package.describe({
  version: '1.0.2',
  // Brief, one-line summary of the package.
  summary: 'Pluggable class for compiling HTML into templates',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.use([
    'underscore',
    'caching-compiler',
    'templating-tools',
    'ecmascript'
  ]);

  api.addFiles('caching-html-compiler.js', 'server');

  api.export("CachingHtmlCompiler", 'server');
});
