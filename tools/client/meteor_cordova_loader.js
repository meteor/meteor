/* This file is only loaded on Cordova-bundled apps and is used only in case
 * autoupdate package is used.
 * It checks if File plugin is installed and a newer version of the app code can
 * be found on persistent storage. In that case those files are dynamically
 * added to the page.
 * Otherwise a normal app code is loaded (shipped with the app initially).
 */

(function () {

  var loadedEvent = (function () {
    var usingEventConstructor = false;

    // some browsers don't support the Event constructor
    // eg Cordova on Android JellyBean
    if (window.Event) {
      usingEventConstructor = true;
    }

    var eventName = 'meteor-cordova-loaded';
    var event;
    if (usingEventConstructor) {
      event = new Event(eventName);
    } else {
      event = document.createEvent('Event');
      event.initEvent(eventName, true, true);
    }

    return {
      dispatch: function () {
        document.dispatchEvent(event);
      }
    };
  })();

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


  // To ensure that all our <script> tags are loaded in the correct order we add
  // them to DOM one by one.
  // The assumption here is that every element in the queue is a function that
  // calls loadScript only once. Because loadScript makes sure to call
  // launchNext after the async operation is done, it works as intended. We
  // allow the last function to be something different (like trigger the
  // document event).
  var queue = [];
  var launchNext = function () {
    if (! queue.length)
      return;
    var fun = queue.shift();
    fun();
  };

  var loadScript = function (url) {
    var scriptTag = document.createElement('script');
    scriptTag.type = "text/javascript";
    scriptTag.src = url;
    scriptTag.onload = launchNext;

    document.getElementsByTagName('head')[0].appendChild(scriptTag);
  };

  var loadStyle = function (url) {
    var styleTag = document.createElement('link');
    styleTag.rel = "stylesheet";
    styleTag.type = "text/css";
    styleTag.href = url;
    document.getElementsByTagName('head')[0].appendChild(styleTag);
  };

  var stripLeadingSlash = function (p) {
    if (p.charAt(0) !== '/')
      throw new Error("bad path: " + p);
    return p.slice(1);
  };

  var loadAssetsFromManifest = function (manifest, urlPrefix) {
    // Set the base href so that relative paths point to the correct version
    // of the app.
    var newBase = document.createElement("base");
    newBase.setAttribute("href", urlPrefix);
    document.getElementsByTagName("head")[0].appendChild(newBase);

    each(manifest, function (item) {
      // We want to use relative paths so that our base href is taken into
      // account.
      var url = item.url ? stripLeadingSlash(item.url) : '';
      if (item.type === 'js')
        queue.push(function () {
          loadScript(url);
        });
      else if (item.type === 'css')
        loadStyle(url);
    });

    queue.push(function () {
      loadedEvent.dispatch();
    });

    launchNext();
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

    loadAssetsFromManifest(__meteor_manifest__, '');
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
    readFile(versionPrefix + 'manifest.json',
        function (err, res) {
      if (err) {
        fallback(err);
        return;
      }

      var program = JSON.parse(res);
      // update the version we are loading
      __meteor_runtime_config__.autoupdateVersionCordova = version;
      // update the public settings
      __meteor_runtime_config__.PUBLIC_SETTINGS = program.PUBLIC_SETTINGS;

      loadAssetsFromManifest(program.manifest, versionPrefix);
    });
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
    var localPathPrefix = cordova.file.applicationStorageDirectory +
                          'Documents/meteor/';
    if (__meteor_runtime_config__.cleanCache) {
      // If cleanCache is enabled, clean the cache and then load the app.
      removeDirectory(localPathPrefix, function (err) {
        if (err) console.log('Failed to clear cache: ' + err.message);
        else console.log('Successfully cleared the cache.');

        loadApp(localPathPrefix);
      });
    } else {
      loadApp(localPathPrefix);
    }
  }, false);
})();

