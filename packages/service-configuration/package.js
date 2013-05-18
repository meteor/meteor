Package.describe({
  summary: "Manage the configuration for third-party services",
  internal: true
});

Package.on_use(function(api) {
  api.add_files('service_configuration_common.js', ['client', 'server']);
});
