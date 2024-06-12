Package.describe({
  summary: "Blaze configuration templates for Weibo OAuth.",
  version: '1.0.3-rc300.3',
});

Package.onUse(api => {
  api.use('ecmascript', 'client');
  api.use('templating@1.4.2', 'client');

  api.addFiles('weibo_login_button.css', 'client');
  api.addFiles(
    ['weibo_configure.html', 'weibo_configure.js'],
  'client');
});
