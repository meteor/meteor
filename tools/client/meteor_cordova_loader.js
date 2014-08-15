/* This file is only loaded on Cordova-bundled apps and is used only in case
 * autoupdate package is used.
 * It checks if File plugin is installed and a newer version of the app code can
 * be found on persistent storage. In that case those files are dynamically
 * added to the page.
 * Otherwise a normal app code is loaded (shipped with the app initially).
 */

(function () {

  var evt = new Event("meteor-cordova-loaded");

  var ajax = function (url, cb) {
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

  document.addEventListener("deviceready", function () {
    var localPathPrefix = cordova.file.applicationStorageDirectory;
    var iOS = /(iPad|iPhone|iPod)/g.test(navigator.userAgent);

    // on iOS 'Documents' is read-write, unlinke the storage dir
    if (iOS)
      localPathPrefix += 'Documents/';

    ajax(localPathPrefix + 'manifest.json',
      function (err, res) {
        if (! err) {
          var manifest = JSON.parse(res).manifest;
          loadAssetsFromManifest(manifest, localPathPrefix);
        } else {
          // We don't have any new versions, default to the bundled assets.
          console.log(err.message);
          console.log('Couldn\'t load from the manifest, falling back to the bundled assets.');

          loadAssetsFromManifest(__meteor_manifest__, '');
        }
    });
  }, false);
})();

