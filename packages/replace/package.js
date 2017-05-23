Package.describe({
  summary: "String replacing helper"
});

Package.on_use(function (api, where) {
  api.use("handlebars", "client");
  api.add_files("replace.js", "client");
});
