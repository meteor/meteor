App.info({
  id: "com.meteor.capacitortests",
  name: "MeteorCapacitorTests",
  description: "Capacitor runtime stability target for tools/native-tests",
  version: "1.0.0",
});

App.setPreference("WebAppStartupTimeout", "20000");
App.setPreference("DisallowOverscroll", "true");
