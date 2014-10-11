Package.describe({
  name: 'mobile-launch-screen',
  summary: 'More control over launch screen on mobile.',
  version: '1.0.0'
});

Cordova.depends({
  'org.apache.cordova.splashscreen': '0.3.3'
});

Package.onUse(function(api) {
  api.addFiles('mobile-launch-screen.js', 'web.cordova');
  api.use(['blaze', 'templating'], 'web.cordova', { weak: true });
  api.export('LaunchScreen');
});

