Package.describe({
  summary: 'Login service for Twitch accounts',
  version: '1.0.0',
});

Package.onUse(api => {
  api.use('ecmascript');
  api.use('accounts-base', ['client', 'server']);
  api.imply('accounts-base', ['client', 'server']);

  api.use('accounts-oauth', ['client', 'server']);
  api.use('twitch-oauth');
  api.imply('twitch-oauth');

  api.use(
    ['accounts-ui', 'twitch-config-ui'],
    ['client', 'server'],
    {weak: true}
  );
  api.addFiles('notice.js');
  api.addFiles('twitch.js');
});
