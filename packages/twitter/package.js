Package.describe({
  summary: "DEPRECATED - Use twitter-oauth instead - Twitter OAuth flow",
  version: '1.2.0-rc.1'
});

Package.onUse(function(api) {
  api.use('twitter-oauth');
  api.use('twitter-config-ui', 'client');
  api.imply('twitter-oauth');
  api.addFiles('deprecation_notice.js');
});
