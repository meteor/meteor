var fileUrlRegEx = /^file:\/\/(.*)/;

module.exports = {
  startupDidComplete: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "MeteorWebApp",
      "startupDidComplete",
      []);
  },

  checkForUpdates: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "MeteorWebApp",
      "checkForUpdates",
      []);
  },

  onNewVersionDownloaded: function(callback) {
    cordova.exec(
      callback,
      console.error,
      "MeteorWebApp",
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
      "MeteorWebApp",
      "onDownloadFailure",
      []);
  },

  localFileSystemUrl: function(fileUrl) {
    var match = fileUrlRegEx.exec(fileUrl);
    if (!match) return fileUrl;

    var path = match[1];
    return "/local-filesystem" + path;
  }
};
