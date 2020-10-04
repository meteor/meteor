Package.describe({
  summary: 'DEPRECATED - Use meteor-developer-oauth instead - Meteor developer accounts OAuth flow',
  version: '1.2.0'
});

Package.onUse(function (api) {
  api.use('meteor-developer-oauth');
  api.use('meteor-developer-config-ui', 'client');
  api.imply('meteor-developer-oauth');
  api.addFiles('deprecation_notice.js');
});
