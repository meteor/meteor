Package.describe({
  summary: "Runtime support for output of Babel transpiler",
  // keep this version === the `babel` version, and bump the wrap
  // numbers of both if you need to increment it.
  version: '4.7.13'
});

Package.onUse(function (api) {
  // Code runs on client or server, wherever it is asked for!
  api.export('babelHelpers'); // See note in babel-runtime.js
  api.addFiles('babel-runtime.js');
});
