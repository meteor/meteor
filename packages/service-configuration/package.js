Package.describe({
  summary: "Manage the configuration for third-party services",
  version: "1.0.10",
  git: 'https://github.com/meteor/meteor/tree/master/packages/service-configuration'
});

Package.onUse(function(api) {
  api.use('accounts-base', ['client', 'server']);
  api.use('mongo', ['client', 'server']);
  api.export('ServiceConfiguration');
  api.addFiles('service_configuration_common.js', ['client', 'server']);
  api.addFiles('service_configuration_server.js', 'server');
});
