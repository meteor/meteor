Package.describe({
  summary: 'Login service for Meetup accounts',
  version: '1.5.0',
});

Package.onUse(api => {
  api.use('ecmascript');
  api.use('accounts-base', ['client', 'server']);
  // Export Accounts (etc) to packages using this one.
  api.imply('accounts-base', ['client', 'server']);

  api.use('accounts-oauth', ['client', 'server']);
  api.use('meetup-oauth');
  api.imply('meetup-oauth');

  api.use(
    ['accounts-ui', 'meetup-config-ui'],
    ['client', 'server'],
    { weak: true }
  );
  api.addFiles('notice.js');
  api.addFiles('meetup.js');
});
