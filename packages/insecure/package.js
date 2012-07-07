Package.describe({
  summary: "Allow all database writes by default",
  internal: false
});

Package.on_use(function (api) {
  api.add_files(['insecure.js'], 'server');
});
