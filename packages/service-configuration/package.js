Package.describe({
  summary: 'Manage the configuration for third-party services',
  version: '1.3.4-beta2160.0',
});

Package.onUse(function(api) {
  api.use('accounts-base', ['client', 'server']);
  api.use('mongo', ['client', 'server']);
  api.use('ecmascript', ['client', 'server']);
  api.export('ServiceConfiguration');
  api.addFiles('service_configuration_common.js', ['client', 'server']);
  api.addFiles('service_configuration_server.js', 'server');
  api.addAssets('service-configuration.d.ts', 'server');
});
