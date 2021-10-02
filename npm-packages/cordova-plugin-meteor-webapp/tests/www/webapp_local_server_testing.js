module.exports = {
  resetToInitialState: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "WebAppLocalServer",
      "resetToInitialState",
      []);
  },

  simulatePageReload: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "WebAppLocalServer",
      "simulatePageReload",
      []);
  },

  simulateAppRestart: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "WebAppLocalServer",
      "simulateAppRestart",
      []);
  },

  getAuthTokenKeyValuePair: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "WebAppLocalServer",
      "getAuthTokenKeyValuePair",
      []);
  },

  downloadedVersionExists: function(version, callback) {
    cordova.exec(
      callback,
      console.error,
      "WebAppLocalServer",
      "downloadedVersionExists",
      [version]);
  },

  simulatePartialDownload: function(version, callback) {
    cordova.exec(
      callback,
      console.error,
      "WebAppLocalServer",
      "simulatePartialDownload",
      [version]);
  }
};
