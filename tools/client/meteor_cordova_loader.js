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

  var COUNTER = 0;
  var loadScript = function (url) {
    console.log('loadscript ' + url)
    var scriptTag = document.createElement('script');
    scriptTag.type = "text/javascript";
    scriptTag.src = url;
    scriptTag.onload = function  () {
      COUNTER--;
      if (! COUNTER)
        document.dispatchEvent(evt);
    };

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
      if (item.type === 'js') {
        COUNTER++;
      }
    });

    each(manifest, function (item) {
      if (item.type === 'js')
        loadScript(urlPrefix + item.url.substring(1));
      else if (item.type === 'css')
        loadStyle(urlPrefix + item.url.substring(1));
    });
  };

  document.addEventListener("deviceready", function () {
    var localPathPrefix = 'cdvfile://localhost/persistent';
    ajax(localPathPrefix + '/manifest.json',
      function (err, res) {
        if (! err) {
          var manifest = JSON.parse(res).manifest;
          loadAssetsFromManifest(manifest, localPathPrefix + '/');
        } else {
          // We don't have any new versions, default to the bundled assets.
          console.log(err.message);
          console.log('Couldn\'t load from the manifest, falling back to the bundled assets.');

          loadAssetsFromManifest(__meteor_manifest__, '');
        }
    });
  }, false);
})();

