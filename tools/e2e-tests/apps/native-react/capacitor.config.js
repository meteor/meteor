const { defineConfig } = require('@meteorjs/capacitor');

module.exports = defineConfig(Meteor => ({
  appId: 'com.meteor.e2e.native.react',
  appName: 'Meteor Native React E2E',
  server: Meteor.isDevelopment
    ? { url: `http://${Meteor.localIp}:${Meteor.port}`, cleartext: true }
    : undefined,
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
