const { defineConfig } = require("@meteorjs/capacitor");

module.exports = defineConfig(Meteor => {
  return {
    appId: "com.meteor.capacitortests",
    appName: "Meteor Capacitor Tests",
    // Load the generated native webDir even during `meteor run` so this fixture
    // exercises the WebAppLocalServer shim and __cordova path adaptation.
    server: {
      androidScheme: "http",
      cleartext: true,
    },
  };
});
