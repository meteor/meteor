/* This file is only loaded on Cordova-bundled apps and is used only in case
 * autoupdate package is used.
 * It checks if File plugin is installed and a newer version of the app code can
 * be found on persistent storage. In that case those files are dynamically
 * added to the page.
 * Otherwise a normal app code is loaded (shipped with the app initially).
 */

(function () {

  var evt = new Event("meteor-cordova-loaded");

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

    console.log(url);

    document.getElementsByTagName('head')[0].appendChild(scriptTag);
  };

  var loadStyle = function (url) {
    var styleTag = document.createElement('link');
    styleTag.rel = "stylesheet";
    styleTag.type = "text/css";
    styleTag.href = url;
    document.getElementsByTagName('head')[0].appendChild(styleTag);
  };

  var loadAssetsFromManifest = function (manifest, urlPrefix) {
    each(manifest, function (item) {
      var url = urlPrefix + (item.url ? item.url.substring(1) : '');
      if (item.type === 'js')
        queue.push(function () {
          loadScript(url);
        });
      else if (item.type === 'css')
        loadStyle(url);
    });

    queue.push(function () {
      document.dispatchEvent(evt);
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

  var cleanCache = function (url, cb) {
    var fail = function (err) {
      console.log("Clearing cache failed: ");
      console.log(err);
      cb();
    };
    window.resolveLocalFileSystemURL(url, function(entry) {
      entry.removeRecursively(function() {
        console.log("Cleared cache successfully.");
        cb();
      }, fail);
    }, fail);
  };

  var loadApp = function (localPathPrefix) {

    readFile(localPathPrefix + 'version',
      function (err, version) {
        if (err) {
          fallback();
          return;
        }

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
    });
  };

  document.addEventListener("deviceready", function () {
    var localPathPrefix = cordova.file.applicationStorageDirectory +
                          'Documents/meteor/';
    if (__meteor_runtime_config__.cleanCache) {
      // If cleanCache is enabled, clean the cache and then load the app.
      cleanCache(localPathPrefix, function () {
        loadApp(localPathPrefix);
      });
    } else {
      loadApp(localPathPrefix);
    }
  }, false);
})();

