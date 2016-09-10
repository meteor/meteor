Package.describe({
  summary: "Facebook OAuth flow",
  summary: "DEPRECATED - Facebook OAuth flow",
  version: "1.3.0"
});

Package.onUse(function(api) {
  api.use('oauth2', ['client', 'server']);
  api.use('oauth', ['client', 'server']);
  api.use('http', ['server']);
  api.use('templating@1.2.13', 'client');
  api.use('underscore', 'server');
  api.use('random', 'client');
  api.use('service-configuration', ['client', 'server']);
  api.use('accounts-facebook@1.1.0');
  api.use('facebook-oauth');
  api.use('facebook-config-ui', 'client');

  api.imply('facebook-oauth');

  api.addFiles('deprecation_notice.js');
});
