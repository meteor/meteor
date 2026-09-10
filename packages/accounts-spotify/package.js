Package.describe({
  summary: 'Login service for Spotify accounts',
  version: '1.0.0',
});

Package.onUse(api => {
  api.use('ecmascript');
  api.use('accounts-base', ['client', 'server']);
  api.imply('accounts-base', ['client', 'server']);

  api.use('accounts-oauth', ['client', 'server']);
  api.use('spotify-oauth');
  api.imply('spotify-oauth');

  api.use(
    ['accounts-ui', 'spotify-config-ui'],
    ['client', 'server'],
    {weak: true}
  );
  api.addFiles('notice.js');
  api.addFiles('spotify.js');
});
