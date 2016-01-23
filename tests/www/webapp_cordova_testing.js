module.exports = {
  resetToInitialState: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "MeteorWebApp",
      "resetToInitialState",
      []);
  },

  simulatePageReload: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "MeteorWebApp",
      "simulatePageReload",
      []);
  },

  simulateAppRestart: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "MeteorWebApp",
      "simulateAppRestart",
      []);
  },

  getAuthTokenKeyValuePair: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "MeteorWebApp",
      "getAuthTokenKeyValuePair",
      []);
  },

  downloadedVersionExists: function(version, callback) {
    cordova.exec(
      callback,
      console.error,
      "MeteorWebApp",
      "downloadedVersionExists",
      [version]);
  },

  simulatePartialDownload: function(version, callback) {
    cordova.exec(
      callback,
      console.error,
      "MeteorWebApp",
      "simulatePartialDownload",
      [version]);
  }
};
