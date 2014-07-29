/* This file is only loaded on Cordova-bundled apps and is used only in case
 * autoupdate package is used.
 * It checks if File plugin is installed and a newer version of the app code can
 * be found on persistent storage. In that case those files are dynamically
 * added to the page.
 * Otherwise a normal app code is loaded (shipped with the app initially).
 */
(function () {
  var __LOGS = [];
  var LOG = function (msg) {
    __LOGS.push(msg);
  };


  var each = function (array, iter) {
    array = array || [];
    for (var i = 0; i < array.length; i++)
      iter(array[i], i);
  };

  var addScriptFromUrl = function (url) {
    var xhrObj =  new XMLHttpRequest();
    xhrObj.open('GET', url, false);
    xhrObj.send('');
    var script = document.createElement('script');
    script.text = xhrObj.responseText;
    try {
      document.getElementsByTagName('head')[0].appendChild(script);
    } catch (err) {
      LOG(err.message);
    }
  };

  var ajax = function (url, cb) {
    window.resolveLocalFileSystemURI(url,
      function (fileEntry) {
        function win(file) {
          var reader = new FileReader();
          reader.onloadend = function (evt) {
            var result = evt.target.result;
            console.log(result);
            cb(null, result);
          };
          reader.readAsText(file);
        }
        var fail = function (evt) {
          cb(new Error("Failed to load entry", evt));
        };
        fileEntry.file(win, fail);
      },
      // error callback
      function (err) { throw err; }
    );
  };

  // fall-back
  var loadFromApp = function () {
    each(__jsUrlsToLoad, function (url) {
      addScriptFromUrl(url);
    });
  };

  document.addEventListener("deviceready", function () {
    ajax('cdvfile://localhost/persistent/manifest.json', function (err, res) {
      console.log('ajax manifest', err);
      console.log(res.content);
      if (err) { loadFromApp(); return; }
      console.log("logged messages", __LOGS);
    });
  }, false);

  LOG('loaded');
  loadFromApp();
})();

