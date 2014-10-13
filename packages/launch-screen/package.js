Package.describe({
  name: 'launch-screen',
  summary: 'More control over launch screen on mobile.',
  version: '1.0.0'
});

Cordova.depends({
  'org.apache.cordova.splashscreen': '0.3.3'
});

Package.onUse(function(api) {
  api.addFiles('mobile-launch-screen.js', 'web');
  api.use(['blaze', 'templating', 'iron:router'], 'web', { weak: true });
  api.export('LaunchScreen');
});

