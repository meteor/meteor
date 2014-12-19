Package.describe({
  summary: "Manage the configuration for third-party services",
  version: "1.0.3"
});

Package.onUse(function(api) {
  api.use('accounts-base', ['client', 'server']);
  api.use('mongo', ['client', 'server']);
  api.export('ServiceConfiguration');
  api.addFiles('service_configuration_common.js', ['client', 'server']);
});
