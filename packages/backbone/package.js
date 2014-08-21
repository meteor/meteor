Package.describe({
  summary: "A minimalist client-side MVC framework",
  version: "0.9.2"
});

Package.on_use(function (api) {
  // XXX Backbone requires either jquery or zepto
  api.use(["jquery", "json", "underscore"]);

  api.add_files("backbone.js");
});
