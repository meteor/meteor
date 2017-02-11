Package.describe({
  summary: "Blaze configuration templates for Weibo OAuth.",
  version: "1.0.0"
});

Package.onUse(function(api) {
  api.use('templating@1.2.13', 'client');

  api.addFiles('weibo_login_button.css', 'client');
  api.addFiles(
    ['weibo_configure.html', 'weibo_configure.js'],
  'client');
});
