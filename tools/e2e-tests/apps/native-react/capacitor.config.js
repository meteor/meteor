const { defineConfig } = require('@meteorjs/capacitor');

module.exports = defineConfig(Meteor => ({
  appId: 'com.meteor.e2e.nativeReact',
  appName: 'Meteor Native React E2E',
  android: {
    buildOptions: {
      releaseType: process.env.CAPACITOR_E2E_ANDROID_FORMAT || 'AAB',
      keystorePassword: 'e2e-signing-secret',
    },
  },
  plugins: {
    MeteorE2E: {
      platform: Meteor.platform,
      isRun: Meteor.isRun,
      isBuild: Meteor.isBuild,
      isNativeAndroid: Meteor.isNativeAndroid,
      isNativeIos: Meteor.isNativeIos,
      mode: Meteor.mode,
      webDir: Meteor.webDir,
      rootUrl: Meteor.rootUrl,
      localIp: Meteor.localIp,
      port: Meteor.port
    }
  }
}));
