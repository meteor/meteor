Package.describe({
  name: 'static-html',
  summary: "Define static page content in .html files",
  version: '1.3.3-alpha300.19',
  git: 'https://github.com/meteor/meteor.git'
});

Package.registerBuildPlugin({
  name: "compileStaticHtmlBatch",
  use: [
    'ecmascript@0.16.8-alpha300.19',
    'caching-html-compiler@2.0.0-alpha300.16',
    'templating-tools@2.0.0-alpha300.16'
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
