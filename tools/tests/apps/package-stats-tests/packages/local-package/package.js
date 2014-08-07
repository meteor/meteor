Package.describe({
  summary: "a package",
  version: "1.0.0"
});

Package.on_use(function (api) {
  api.add_files("blah.js");
});
