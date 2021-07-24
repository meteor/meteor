Package.describe({
  summary: "DEPRECATED - Use google-oauth instead - Google OAuth flow",
  version: "1.2.0",
  deprecated: 'Use google-oauth instead',
  documentation: null
});

Package.onUse(function(api) {
  api.use('google-oauth');
  api.use('google-config-ui', 'client');
  api.imply('google-oauth');

  api.addFiles('deprecation_notice.js');
});
