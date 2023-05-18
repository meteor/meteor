Package.describe({
  name: 'static-html',
  summary: "Define static page content in .html files",
  version: '2.0.0-alpha300.8',
  git: 'https://github.com/meteor/meteor.git'
});

Package.registerBuildPlugin({
  name: "compileStaticHtmlBatch",
  use: [
    'ecmascript@1.0.0-alpha300.5',
    'caching-html-compiler@2.0.0-alpha300.5',
    'templating-tools@2.0.0-alpha300.5'
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
