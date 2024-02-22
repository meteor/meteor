Package.describe({
  // XXX We currently hard-code the "launch-screen" package in the
  // build tool. If this package is in your app, we turn off the
  // default splash screen loading behavior (this packages hides it
  // explicitly). In the future, there should be a better interface
  // between such packages and the build tool.
  name: 'launch-screen',
  summary: 'Default and customizable launch screen on mobile.',
  version: '1.3.1-beta300.3',
});

Cordova.depends({
  'cordova-plugin-splashscreen': '6.0.0'
});

Package.onUse(function(api) {
  api.addFiles('mobile-launch-screen.js', 'web.cordova');
  api.addFiles('default-behavior.js', 'web.cordova');
  api.use(['blaze', 'templating'], 'web.cordova', { weak: true });

  api.export('LaunchScreen');
});
