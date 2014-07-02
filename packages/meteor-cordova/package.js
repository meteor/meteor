Package.describe({
  name:"meteor-cordova",
  summary: "Cordova package for Meteor.",
  version: "1.0.0"
});

Package._transitional_registerBuildPlugin({
  name: "cordovaPlugin",
  use: [],
  sources: [
    'plugin/cordova-plugin.js'
  ],
});