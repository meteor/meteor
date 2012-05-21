Package.describe({
  summary: "Micro client-side router inspired by the Express router"
});

Package.on_use(function (api, where) {
  api.add_files("page.js", 'client');
});
