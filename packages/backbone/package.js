Package.describe({
  summary: "A minimalist client-side MVC framework"
});

Package.on_use(function (api) {
  
  api.use(["jquery", "json", "underscore"]);

  api.add_files("backbone.js");
});
