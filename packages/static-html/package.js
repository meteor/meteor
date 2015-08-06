Package.describe({
  version: '0.0.2-anubhav.0',
  // Brief, one-line summary of the package.
  summary: 'Define static page content in .html files',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.registerBuildPlugin({
  name: "compileStaticHtmlBatch",
  use: [
    'caching-html-compiler',
    'ecmascript',
    'templating-tools',
    'underscore'
  ],
  sources: [
    'static-html.js'
  ]
});

Package.onUse(function(api) {
  api.use('isobuild:compiler-plugin@1.0.0');

  // Body attributes are compiled to code that uses Meteor.startup
  api.imply('meteor', 'client');
});
