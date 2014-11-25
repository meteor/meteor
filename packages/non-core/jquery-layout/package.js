// XXX should probably nudge people toward the CSS Flexible Box Model
// flexie, rather than this

Package.describe({
  name: "jquery-layout",
  summary: "Deprecated package for JS layout",
  version: "1.0.3"
});

Package.on_use(function (api) {
  api.versionsFrom("1.0");
  api.use('jquery');
  api.add_files('jquery.layout.js', 'client');
});
