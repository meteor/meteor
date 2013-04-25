Package.describe({
  summary: "Try to detect inadequate input sanitization"
});

Package.on_use(function (api) {
  api.use(['livedata'], ['server']);
  api.add_files(['audit_argument_checks.js'], 'server');
});
