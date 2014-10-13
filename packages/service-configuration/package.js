Package.describe({
  summary: "Manage the configuration for third-party services",
  version: "1.0.2"
});

Package.on_use(function(api) {
  api.use('accounts-base', ['client', 'server']);
  api.use('mongo', ['client', 'server']);
  api.export('ServiceConfiguration');
  api.add_files('service_configuration_common.js', ['client', 'server']);
});
