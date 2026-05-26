// Keep `name` space-free so the resulting Xcode scheme and .app bundle have
// predictable paths (xcodebuild -scheme MeteorSmoke). `appId` is the bundle
// identifier Maestro uses to launch the app; it can stay descriptive.
App.info({
  id: "com.meteor.smoke",
  name: "MeteorSmoke",
  description: "Smoke test target for tools/native-tests",
  version: "1.0.0",
});

App.setPreference("WebAppStartupTimeout", "20000");
App.setPreference("DisallowOverscroll", "true");
