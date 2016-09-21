Package.describe({
  summary: "Facebook OAuth flow",
  summary: "DEPRECATED - Facebook OAuth flow",
  version: "1.3.0"
});

Package.onUse(function(api) {
  api.use('facebook-oauth');
  api.use('facebook-config-ui', 'client');

  api.imply('facebook-oauth');

  api.addFiles('deprecation_notice.js');
});
