module.exports = {
  startupDidComplete: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "WebAppCordova",
      "startupDidComplete",
      []);
  },

  checkForUpdates: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "WebAppCordova",
      "checkForUpdates",
      []);
  },

  onNewVersionDownloaded: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "WebAppCordova",
      "onNewVersionDownloaded",
      []);
  },

  onDownloadFailure: function(callback) {
    cordova.exec(
      function(errorMessage) {
        // Convert error message to a proper error object
        var error = new Error(errorMessage);
        callback(error);
      },
      console.error,
      "WebAppCordova",
      "onDownloadFailure",
      []);
  }
};
