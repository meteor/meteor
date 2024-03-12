// XXX should probably nudge people toward the CSS Flexible Box Model
// flexie, rather than this

Package.describe({
  name: "jquery-layout",
  summary: "Deprecated package for JS layout",
  version: "1.0.3",
  deprecated: true,
  documentation: null
});

Package.onUse(function (api) {
  api.use('jquery');
  api.addFiles('jquery.layout.js', 'client');
});
