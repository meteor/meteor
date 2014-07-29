/* This file is only loaded on Cordova-bundled apps and is used only in case
 * autoupdate package is used.
 * It checks if File plugin is installed and a newer version of the app code can
 * be found on persistent storage. In that case those files are dynamically
 * added to the page.
 * Otherwise a normal app code is loaded (shipped with the app initially).
 */
window.onload = function () {
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

  // XXX refactor to share code with writeText
  var ajax = function (url, cb) {
    window.resolveLocalFileSystemURL(url,
      function (fileEntry) {
        var success = function (file) {
          var reader = new FileReader();
          reader.onloadend = function (evt) {
            var result = evt.target.result;
            cb(null, result);
          };
          reader.onerror = function (evt) {

            cb(new Error("Failed to load entry"), null);
          };
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

  var writeText = function (name, text, cb) {
    window.requestFileSystem(window.LocalFileSystem.PERSISTENT, 0, function(fileSystem) {
    fileSystem.root.getFile(name,
      {create: true }, function (fileEntry) {
        fileEntry.createWriter(function (writer) {
          writer.onwriteend = function (evt) { cb(null, evt.target.result); };
          writer.onerror = function (evt) { cb(evt, null); };
          writer.write(text);
          writer.abort();
        }, function (e) { cb(e, null); });
      }, function (e) { cb(e, null); });
    }, function (e) { cb(e, null); });
  };

  // fall-back
  var loadFromApp = function () {
    each(__jsUrlsToLoad, function (url) {
      addScriptFromUrl(url);
    });
  };

  var loadFromManifest = function () {
    ajax('cdvfile://localhost/persistent/manifest.json', function (err, res) {
      if (err) {
          console.log("error", err);
        loadFromApp();
        return;
      }

      var manifest = JSON.parse(res);
      var allJs = {};
      var downloads = 0;

      each(manifest, function (item) {
        if (! item.url)
          return;

        downloads++;
        ajax('cdvfile://localhost/persistent' + item.url, function (err, res) {
          if (err) {
            console.log("error", err);
            loadFromApp();
            return;
          }
          downloads--;
          allJs[item.url] = res;
          if (! downloads) {
            console.log('DONE DOWNLOADING');
            each(manifest, function (item) {
              if (! item.url || item.type !== 'js') {
                return;
              }
              addScriptWithText(allJs[item.url]);
            });
            console.log('BEFORE');

            var newHtml = document.getElementsByTagName('html')[0].innerHTML;
            newHtml = '<html>' + newHtml + '</html>';

            writeText('new.html', newHtml, function (err, res) {
              if (err) {
                console.log('Error writing file', JSON.stringify(err));
                loadFromApp();
                return;
              }
              // location.reload();
            });
            console.log('after');
          }
        });
      });
    });
  };
  document.addEventListener("deviceready", function () {
    ajax('cdvfile://localhost/persistent/new.html', function (err, res) {
      if (err) {
        loadFromManifest();
      }
      document.open();
      document.write(res);
      document.close();
    });
  }, false);
};