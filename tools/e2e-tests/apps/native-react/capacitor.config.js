const { defineConfig } = require('@meteorjs/capacitor');

module.exports = defineConfig(Meteor => ({
  appId: 'com.meteor.e2e.nativeReact',
  appName: 'Meteor Native React E2E',
  plugins: {
    MeteorE2E: {
      platform: Meteor.platform,
      isRun: Meteor.isRun,
      isBuild: Meteor.isBuild,
      isNativeAndroid: Meteor.isNativeAndroid,
      isNativeIos: Meteor.isNativeIos,
      mode: Meteor.mode,
      webDir: Meteor.webDir,
      localIp: Meteor.localIp,
      port: Meteor.port
    }
  }
}));
