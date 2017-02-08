Package.describe({
  summary: 'DEPRECATED - Use meetup-oauth instead - Meetup OAuth flow',
  version: '1.7.0'
});

Package.onUse(function (api) {
  api.use('meetup-oauth');
  api.use('meetup-config-ui', 'client');
  api.imply('meetup-oauth');
  api.addFiles('deprecation_notice.js');
});
