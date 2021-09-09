Package.describe({
  summary: '(Deprecated) Syntax highlighting of code, from Google',
  version: '2.0.0',
  deprecated: true,
  documentation: null
});

Package.onUse(function (api) {
  api.addFiles('deprecated.js', 'client');
});
