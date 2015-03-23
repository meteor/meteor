Package.describe({
  summary: "Runtime support for output of Babel transpiler",
  version: '1.0.0'
});

Package.onUse(function (api) {
  // Code runs on client or server, wherever it is asked for!
  api.export('babelHelpers'); // See note in babel-runtime.js
  api.addFiles('babel-runtime.js');
});
