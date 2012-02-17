Package.describe({
  summary: "Automatically publish all data in the database to every client"
});

Package.on_use(function (api, where) {
  api.use('livedata', 'server');
  api.add_files("autopublish.js", "server");
});