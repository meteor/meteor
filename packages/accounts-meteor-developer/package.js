Package.describe({
  summary: 'Login service for Meteor developer accounts',
  version: '1.3.0'
});

Package.onUse(function (api) {
  api.use(['underscore', 'random']);
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);

  api.use('accounts-oauth', ['client', 'server']);
  api.use('meteor-developer-oauth');
  api.imply('meteor-developer-oauth');

  api.use(
    ['accounts-ui', 'meteor-developer-config-ui'],
    ['client', 'server'],
    { weak: true }
  );
  api.addFiles('notice.js');
  api.addFiles('meteor-developer.js');
});
