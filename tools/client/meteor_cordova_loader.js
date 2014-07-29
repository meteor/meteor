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

  var addScriptWithText = function (text) {
    var script = document.createElement('script');
    script.text = text;
    document.getElementsByTagName('head')[0].appendChild(script);
  };

  var addScriptFromUrl = function (url) {
    var xhrObj =  new XMLHttpRequest();
    xhrObj.open('GET', url, false);
    xhrObj.send('');
    addScriptWithText(xhrObj.responseText);
  };

  var ajax = function (url, cb) {
    window.resolveLocalFileSystemURL(url,
      function (fileEntry) {
        function win(file) {
          var reader = new FileReader();
          reader.onloadend = function (evt) {
            var result = evt.target.result;
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
    // document.open();
    // document.write("<html><body>HAHAHAHAHAHA</body></html>");
    // console.log("MeteorRider replaceDom wrote: []");
    // document.close();
    ajax('cdvfile://localhost/persistent/manifest.json', function (err, res) {
      var manifest = JSON.parse(res);
      console.log("Manifest downloaded");
      var allJs = {};
      var downloads = 0;
      each(manifest, function (item) {
        if (! item.url)
          return;

        downloads++;
        ajax('cdvfile://localhost/persistent' + item.url, function (err, res) {
          if (err) { console.log("error", err); loadFromApp(); return; }
          downloads--;
          allJs[item.url] = res;
          console.log(downloads);
          if (! downloads) {
            console.log("DONE DOWNLOADING");
            each(manifest, function (item) {
              console.log("ADDING", item.url);
              addScriptWithText(allJs[item.url]);
            });
          }
        });
      });
      if (err) { loadFromApp(); return; }
    });
    console.log("logged messages", __LOGS);
  }, false);

  LOG('loaded');
  loadFromApp();
})();

