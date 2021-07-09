Package.describe({
  summary: "DEPRECATED - Use weibo-oauth instead - Weibo OAuth flow",
  version: '1.2.0',
  deprecated: 'Use weibo-oauth instead',
  documentation: 'README.md'
});

Package.onUse(function(api) {
    api.use('weibo-oauth');
    api.use('weibo-config-ui', 'client');
    api.imply('weibo-oauth');
    api.addFiles('deprecation_notice.js');
});
