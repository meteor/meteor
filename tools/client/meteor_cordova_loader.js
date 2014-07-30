/* This file is only loaded on Cordova-bundled apps and is used only in case
 * autoupdate package is used.
 * It checks if File plugin is installed and a newer version of the app code can
 * be found on persistent storage. In that case those files are dynamically
 * added to the page.
 * Otherwise a normal app code is loaded (shipped with the app initially).
 */

(function () {

  var evt = new Event("meteor-cordova-loaded");

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

  document.addEventListener("deviceready", function () {
    ajax('cdvfile://localhost/persistent/__cordova_program__.html',
      function (err, res) {
        if (! err) {
          document.open('text/html', 'replace');
          document.write(res);
          document.close();
        } else {
          // We don't have any new versions, default to the bundled assets.
        }
        console.log("Dispatched");
        document.dispatchEvent(evt);
    });
  }, false);
})();