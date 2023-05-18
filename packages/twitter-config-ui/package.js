Package.describe({
  summary: "Blaze configuration templates for Twitter OAuth.",
  version: '2.0.0-alpha300.7',
});

Package.onUse(function(api) {
  api.use('templating@2.0.0-alpha300.5', 'client');

  api.addFiles('twitter_login_button.css', 'client');
  api.addFiles(
    ['twitter_configure.html', 'twitter_configure.js'],
    'client');
});
