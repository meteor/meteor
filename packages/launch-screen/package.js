Package.describe({
  // XXX We currently hard-code the "launch-screen" package in the
  // build tool. If this package is in your app, we turn off the
  // default splash screen loading behavior (this packages hides it
  // explicitly). In the future, there should be a better interface
  // between such packages and the build tool.
  name: 'launch-screen',
  summary: 'Default and customizable launch screen on mobile.',
  version: '1.0.5-cordova.4'
});

Cordova.depends({
  'cordova-plugin-splashscreen': 'https://github.com/apache/cordova-plugin-splashscreen.git#2e1ec329168633b39c0251ca9e1ec87d9a9483c9'
});

Package.onUse(function(api) {
  api.addFiles('mobile-launch-screen.js', 'web');
  api.addFiles('default-behavior.js', 'web');
  api.use(['blaze', 'templating'], 'web', { weak: true });

  api.export('LaunchScreen');
});
