Package.describe({
  name: "babel-runtime",
  summary: "Runtime support for output of Babel transpiler",
  version: '0.1.4',
  documentation: 'README.md'
});

Package.onUse(function (api) {
  // Code runs on client or server, wherever it is asked for!
  api.addFiles('babel-runtime.js');
  api.export('babelHelpers'); // See note in babel-runtime.js
});
