/* This file is only loaded on Cordova-bundled apps and is used only in case
 * autoupdate package is used.
 * It checks if File plugin is installed and a newer version of the app code can
 * be found on persistent storage. In that case those files are dynamically
 * added to the page.
 * Otherwise a normal app code is loaded (shipped with the app initially).
 */

(function () {
  var readFile = function (url, cb) {
    window.resolveLocalFileSystemURL(url,
      function (fileEntry) {
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
          cb(new Error("Failed to load entry"), null);
        };
        fileEntry.file(success, fail);
      },
      // error callback
      function (err) { cb(new Error("Failed to load entry"), null); }
    );
  };

  var each = function (array, f) {
    for (var i = 0; i < array.length; i++)
      f(array[i], i, array);
  };


  var stripLeadingSlash = function (p) {
    if (p.charAt(0) !== '/')
      throw new Error("bad path: " + p);
    return p.slice(1);
  };

  var randomInt = function (min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };

  var loadTries = 0;
  var loadFromLocation = function (location) {
    var cordovaRoot = decodeURI(window.location.href).replace(/\/index.html$/, '/').replace(/^file:\/\/?/, '');
    var httpd = cordova && cordova.plugins && cordova.plugins.CorHttpd;
    var port = randomInt(10000, 50000);

    var retry = function () {
      loadTries++;
      if (loadTries > 10) {
        console.log('Giving up on starting the server.');
      } else {
        console.log('Retrying to to start the server.');
        loadFromLocation(location);
      }
    };

    httpd.getURL(function(url){
      if (url.length > 0) {
        // if server is already running, stop it and retry
        httpd.stopServer(retry, retry);
      } else {
        console.log('Starting the server on port ' + port);
        httpd.startServer({
          'www_root' : location,
          'port' : port,
          'cordovajs_root': cordovaRoot
        }, function (url) {
          // go to the new proxy url
          window.location = url;
        }, function (error) {
          // failed to start a server, is port already in use?
          retry();
        });
      }

    }, function () {
      // failed to call to server: retry
      retry();
    });
  };

  // Fallback to the bundled assets from the disk. If an error is passed as an
  // argument, then there was a problem reading from the manifest files. If
  // no error is passed, then we simply do not have any new versions.
  var fallback = function (err) {
    if (err) {
      console.log('Couldn\'t load from the manifest, ' +
                  'falling back to the bundled assets.');
    } else {
      console.log('No new versions saved to disk.');
    }

    loadFromLocation('application');
  };

  var listDirectory = function (url, options, cb) {
    if (typeof options === 'function')
      cb = options, options = {};

    var fail = function (err) { cb(err); };
    window.resolveLocalFileSystemURL(url, function (entry) {
      var reader = entry.createReader();
      reader.readEntries(function (entries) {
        var names = [];
        each(entries, function (entry) {
          if (! options.dirsOnly || entry.isDirectory)
            names.push(entry.name);
        });
        cb(null, names);
      }, fail);
    }, fail);
  };

  var removeDirectory = function (url, cb) {
    var fail = function (err) {
      cb(err);
    };
    window.resolveLocalFileSystemURL(url, function (entry) {
      entry.removeRecursively(function () {
        cb();
      }, fail);
    }, fail);
  };

  var loadVersion = function (version, localPathPrefix) {
    var versionPrefix = localPathPrefix + version + '/';
    // We have a version string, now read the new version
    // Relative to "bundle.app/www"
    var location = '../../Documents/meteor/' + version;
    loadFromLocation(location);
  };

  var loadApp = function (localPathPrefix) {
    readFile(localPathPrefix + 'version',
      function (err, version) {
        if (err) {
          fallback();
          return;
        }

        // Try to clean up our cache directory, make sure to scan the directory
        // *before* loading the actual app. This ordering will prevent race
        // conditions when the app code tries to download a new version before
        // the old-cache removal has scanned the cache folder.
        listDirectory(localPathPrefix, {dirsOnly: true}, function (err, names) {
          loadVersion(version, localPathPrefix);

          if (err) return;
          each(names, function (name) {
            // Skip the folder with the latest version
            if (name === version)
              return;

            // remove everything else, as we don't want to keep too much cache
            // around on disk
            removeDirectory(localPathPrefix + name + '/', function (err) {
              if (err) {
                console.log('Failed to remove an old cache folder '
                            + name + ':' + err.message);
              } else {
                console.log('Successfully removed an old cache folder ' + name);
              }
            });
          });
        });
    });
  };

  document.addEventListener("deviceready", function () {
    if (window.cordova.logger)
      window.cordova.logger.__onDeviceReady();

    var localPathPrefix = cordova.file.applicationStorageDirectory +
                          'Documents/meteor/';
    loadApp(localPathPrefix);
  }, false);
})();

