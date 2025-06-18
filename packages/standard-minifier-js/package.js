Package.describe({
  name: 'standard-minifier-js',
  version: '3.1.0',
  summary: 'Standard javascript minifiers used with Meteor apps by default.',
  documentation: 'README.md',
});

Package.registerBuildPlugin({
  name: "minifyStdJS",
  use: [
    'minifier-js',
    'ecmascript'
  ],
  npmDependencies: {
    '@meteorjs/swc-core': '1.1.3',
    'acorn': '8.10.0',
    "@babel/runtime": "7.18.9",
    '@babel/parser': '7.22.7',
    'terser': '5.19.2',
    '@meteorjs/reify': '0.25.4',
  },
  sources: [
    'plugin/minify-js.js',
    'plugin/stats.js',
  ],
});

Package.onUse(function(api) {
  api.use('isobuild:minifier-plugin@1.0.0');
});
