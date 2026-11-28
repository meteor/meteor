Package.describe({
  summary: 'Blaze configuration templates for Spotify OAuth.',
  version: '1.0.0',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@1.4.2', 'client');
  api.addFiles(
    ['spotify_configure.html', 'spotify_configure.js'],
    'client'
  );
});
