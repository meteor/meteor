/* This file is only loaded on Cordova-bundled apps and is used only in case
 * autoupdate package is used.
 * It checks if File plugin is installed and a newer version of the app code can
 * be found on persistent storage. In that case those files are dynamically
 * added to the page.
 * Otherwise a normal app code is loaded (shipped with the app initially).
 */
(function () {
  var each = function (array, iter) {
    array = array || [];
    for (var i = 0; i < array.length; i++)
      iter(array[i], i);
  };

  var addScriptWithText = function (text) {
    var script = document.createElement('script');
    script.text = text;
    script.type = 'text/javascript';
    script.className = "__meteor_dynamic__";
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

  var writeText = function (name, text, cb) {
    window.requestFileSystem(window.LocalFileSystem.TEMPORARY, 0, function(fileSystem) {
    fileSystem.root.getFile(name,
      { create: true }, function (fileEntry) {
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

  var loadFromProgram = function (program, cb) {
    var manifest = program.manifest;
    var allJs = {};
    var downloads = 0;

    each(manifest, function (item) {
      if (! item.url)
        return;

      downloads++;
      ajax('cdvfile://localhost/persistent' + item.url, function (err, res) {
        if (err) {
          cb(new Error("Could not find item, load old manifest"));
          return;
        }
        downloads--;
        allJs[item.url] = res;
        if (! downloads) {

          var script = document.getElementsByClassName('__meteor_dynamic__');
          while (script[0]) {
            script[0].parentNode.removeChild(script[0]);
          }

          each(manifest, function (item) {
            if (! item.url || item.type !== 'js') {
              return;
            }
            addScriptWithText(allJs[item.url]);
          });

          var newHtml = document.getElementsByTagName('html')[0].innerHTML;
          var newJson = {
            html: newHtml,
            version: program.version
          };

          writeText('new.json', JSON.stringify(newJson), function (err, res) {
            if (err) {
              console.log('Error writing file', JSON.stringify(err));
              cb(new Error("Could not find item, load old manifest"));
              return;
            }
            cb(null, newJson);
          });
        }
      });
    });
  };

  document.addEventListener("deviceready", function () {
    ajax('cdvfile://localhost/persistent/manifest.json', function (err, res) {
      if (err) {
        console.log("no manifest");
        return;
      }

      var program = JSON.parse(res);
      var manifestVersion = program.version;

      ajax('cdvfile://localhost/temporary/new.json', function (err, res) {
        if (err) {
          loadFromProgram(program, function (err, res) {
            if (! err) {
              console.log("LOADING FROM PROGRAM");
              document.open('text/html', 'replace');
              document.write(res.html);
              document.close();
            }
            return;
          });
        } else if (res) {
          var newHtml = JSON.parse(res);
              console.log("LOADING FROM NEW.jSON", manifestVersion, newHtml.version);
            document.open('text/html', 'replace');
            document.write(newHtml.html);
            document.close();
        }
      });
    });
  }, false);

  loadFromApp();
})();