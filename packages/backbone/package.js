Package.describe({
  summary: "A minimalist client-side MVC framework"
});

Package.on_use(function (api, where) {
  // XXX Backbone requires either jquery or zepto
  api.use(["jquery", "json"]);

  where = where || ['client', 'server'];
  api.add_files("backbone.js", where);
});
