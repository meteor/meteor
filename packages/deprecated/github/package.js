Package.describe({
  summary: 'DEPRECATED - Use github-oauth instead - GitHub OAuth flow',
  version: '1.2.0'
});

Package.onUse(function (api) {
  api.use('github-oauth');
  api.use('github-config-ui', 'client');
  api.imply('github-oauth');
  api.addFiles('deprecation_notice.js');
});
