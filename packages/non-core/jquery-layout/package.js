// XXX should probably nudge people toward the CSS Flexible Box Model
// flexie, rather than this

Package.describe({
  summary: "Easily create arbitrary multicolumn layouts",
  version: "1.0.2"
});

Package.on_use(function (api) {
  api.use('jquery');
  api.add_files('jquery.layout.js', 'client');
});
