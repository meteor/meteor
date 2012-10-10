Package.describe({
  summary: "Allow all database writes by default"
});

Package.on_use(function (api) {
  api.use(['mongo-livedata']);
  api.add_files(['insecure.js'], 'server');
});
