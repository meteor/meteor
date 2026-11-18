Package.describe({
  summary: 'Blaze configuration templates for Twitch OAuth.',
  version: '1.0.0',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@1.4.2', 'client');
  api.addFiles(
    ['twitch_configure.html', 'twitch_configure.js'],
    'client'
  );
});
