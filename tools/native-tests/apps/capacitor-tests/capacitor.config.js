const { defineConfig } = require("@meteorjs/capacitor");

module.exports = defineConfig(() => ({
  appId: "com.meteor.capacitortests",
  appName: "Meteor Capacitor Tests",
  android: {
    buildOptions: process.env.NATIVE_TEST_KEYSTORE ? {
      keystorePath: process.env.NATIVE_TEST_KEYSTORE,
      keystorePassword: process.env.NATIVE_TEST_KEYSTORE_PASSWORD,
      keystoreAlias: "native-test",
      keystoreAliasPassword: process.env.NATIVE_TEST_KEYSTORE_PASSWORD,
    } : undefined,
  },
}));
