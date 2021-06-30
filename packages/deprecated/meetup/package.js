Package.describe({
  summary: 'DEPRECATED - Use meetup-oauth instead - Meetup OAuth flow',
  version: '1.7.0',
  deprecated: 'Use meetup-oauth instead',
  documentation: 'README.md'
});

Package.onUse(function (api) {
  api.use('meetup-oauth');
  api.use('meetup-config-ui', 'client');
  api.imply('meetup-oauth');
  api.addFiles('deprecation_notice.js');
});
