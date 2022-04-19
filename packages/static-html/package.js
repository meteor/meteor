Package.describe({
  name: 'static-html',
  summary: "Define static page content in .html files",
  version: '1.3.2',
  git: 'https://github.com/meteor/meteor.git'
});

Package.registerBuildPlugin({
  name: "compileStaticHtmlBatch",
  use: [
    'ecmascript@0.15.1',
    'caching-html-compiler@1.2.1',
    'templating-tools@1.2.1'
  ],
  sources: [
    'static-html.js'
  ]
});

Package.onUse(function(api) {
  api.use('isobuild:compiler-plugin@1.0.0');

  // Body attributes are compiled to code that uses Meteor.startup
  api.imply('meteor@1.2.17', 'client');
});
