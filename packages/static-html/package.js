Package.describe({
  name: 'static-html',
  summary: "Define static page content in .html files",
  version: '1.4.0',
  git: 'https://github.com/meteor/meteor.git'
});

Package.registerBuildPlugin({
  name: "compileStaticHtmlBatch",
  use: [
    'ecmascript@0.16.2',
    'static-html-tools@1.0.0'
  ],
  sources: [
    'static-html.js'
  ]
});

Package.onUse(function(api) {
  api.use('isobuild:compiler-plugin@1.0.0');

  // Body attributes are compiled to code that uses Meteor.startup
  api.imply('meteor@1.10.0', 'client');
});
