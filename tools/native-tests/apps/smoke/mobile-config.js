// Keep the native product name and bundle identifier stable for simulator
// install and cleanup. Cordova iOS 8 uses the fixed Xcode scheme `App`.
App.info({
  id: "com.meteor.smoke",
  name: "MeteorSmoke",
  description: "Smoke test target for tools/native-tests",
  version: "1.0.0",
});

App.setPreference("WebAppStartupTimeout", "20000");
App.setPreference("DisallowOverscroll", "true");
