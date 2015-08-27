/* This file is only loaded on Cordova-bundled apps and is used only in case
 * autoupdate package is used.
 * It checks if File plugin is installed and a newer version of the app code can
 * be found on persistent storage. In that case those files are dynamically
 * added to the page.
 * Otherwise a normal app code is loaded (shipped with the app initially).
 */

(function () {
  var DEBUG_TAG = 'METEOR CORDOVA DEBUG (meteor_cordova_loader.js) ';
  var log = function (msg) {
    console.log(DEBUG_TAG + msg);
  };
  var uriToPath = function (uri) {
    return decodeURI(uri).replace(/^file:\/\//g, '');
  };
  var readFile = function (url, cb) {
    window.resolveLocalFileSystemURL(url, function (fileEntry) {
      var success = function (file) {
        var reader = new FileReader();
        reader.onloadend = function (evt) {
          var result = evt.target.result;
          cb(null, result);
        };
        reader.onerror = fail;
        reader.readAsText(file);
      };
      var fail = function (evt) {
        cb(new Error("Failed to load entry: " + url), null);
      };
      fileEntry.file(success, fail);
    },
    // error callback
    function (err) { cb(new Error("Failed to resolve entry: " + url), null);
    });
  };

  var loadTries = 0;
  var loadFromLocation = function (location) {
    var cordovaRoot =
      uriToPath(window.location.href).replace(/\/index.html$/, '/');

    var httpd = cordova && cordova.plugins && cordova.plugins.CordovaUpdate;

    var retry = function () {
      loadTries++;
      if (loadTries > 10) {
        // XXX: If this means the app fails, we should probably do exponential backoff
        // or at least show a message
        log('Failed to start the server (too many retries)');
      } else {
        log('Starting the server (retry #' + loadTries + ')');
        loadFromLocation(location);
      }
    };

    httpd.startServer({
      'www_root' : location,
      'cordovajs_root': cordovaRoot
    }, function (url) {
      // go to the new proxy url
      log("Loading from url: " + url);
      window.location = url;
    }, function (error) {
      // failed to start a server, is port already in use?
      log("Failed to start the server: " + error);
      retry();
    });
  };

  // Fallback to the bundled assets from the disk. If an error is passed as an
  // argument, then there was a problem reading from the manifest files. If
  // no error is passed, then we simply do not have any new versions.
  var fallback = function (err) {
    if (err) {
      log("Couldn't load from the manifest, falling back to the bundled assets.");
    } else {
      log('No new versions saved to disk.');
    }
    var location = cordova.file.applicationDirectory + 'www/application/';
    location = uriToPath(location);

    loadFromLocation(location);
  };

  var loadVersion = function (version, localPathPrefix) {
    var versionPrefix = localPathPrefix + version + '/';
    var location = uriToPath(versionPrefix);
    loadFromLocation(location);
  };

  var loadApp = function (localPathPrefix) {
    readFile(localPathPrefix + 'version', function (err, version) {
      if (err) {
        log("Error reading version file " + err);
        fallback(err);
        return;
      }

      loadVersion(version, localPathPrefix);
    });
  };

  document.addEventListener("deviceready", function () {
    var startLoading = function () {
      if (!cordova.file) {
        // If the plugin didn't actually load, try again later.
        // See a larger comment with details in
        // packages/meteor/startup_client.js
        setTimeout(startLoading, 20);
        return;
      }

      var localPathPrefix = cordova.file.dataDirectory + 'meteor/';
      loadApp(localPathPrefix);
    };

    startLoading();
  }, false);
})();

