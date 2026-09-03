Package.describe({
  summary: 'Blaze configuration templates for Discord OAuth.',
  version: '1.0.0',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@1.4.2', 'client');
  api.addFiles(
    ['discord_configure.html', 'discord_configure.js'],
    'client'
  );
});
