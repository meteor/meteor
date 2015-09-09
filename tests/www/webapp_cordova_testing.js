module.exports = {
  resetToInitialState: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "WebAppCordova",
      "resetToInitialState",
      []);
  },

  simulatePageReload: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "WebAppCordova",
      "simulatePageReload",
      []);
  },

  simulateAppRestart: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "WebAppCordova",
      "simulateAppRestart",
      []);
  },

  downloadedVersionExists: function(version, callback) {
    cordova.exec(
      callback,
      console.error,
      "WebAppCordova",
      "downloadedVersionExists",
      [version]);
  },

  simulatePartialDownload: function(version, callback) {
    cordova.exec(
      callback,
      console.error,
      "WebAppCordova",
      "simulatePartialDownload",
      [version]);
  }
};
