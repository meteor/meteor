Package.describe({
  summary: "JavaScript and CSS minifiers",
  internal: true
});

Npm.depends({
  "clean-css": "2.0.2",
  "uglify-js": "2.4.7",
  "css-parse": "1.6.0",
  "css-stringify": "1.4.1"
});

Package.on_use(function (api) {
  api.export(['CleanCSSProcess', 'UglifyJSMinify']);
  api.export(['CssParse', 'CssStringify']);
  api.add_files('minifiers.js', 'server');
});
