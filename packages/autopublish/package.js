Package.describe({
  summary: "Automatically publish the entire database to all clients"
});

Package.on_use(function (api, where) {
  api.use('livedata', 'server');
  api.add_files("autopublish.js", "server");
});