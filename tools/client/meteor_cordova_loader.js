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

  var ajax = function (url, cb) {
    try {
      var reader = new FileReader();
      console.log("reader created");
      reader.onloadend = function (evt) {
        console.log("read success");
        console.log(evt.target.result);
        cb(null, evt);
      };
      reader.error = function (evt) {
        console.log("error", JSON.stringify(evt));
      };
      reader.readAsDataURL(url);
    } catch (e) {
      console.log("ERROR READING", e.message);
    }
  };

  // fall-back
  var loadFromApp = function () {
    each(__jsUrlsToLoad, function (url) {
      var xhrObj =  new XMLHttpRequest();
      xhrObj.open('GET', url, false);
      xhrObj.send('');
      var script = document.createElement('script');
      script.text = xhrObj.responseText;
      try {
        document.getElementsByTagName('head')[0].appendChild(script);
      } catch (err) {
        console.log(err.message);
      }
    });
  };

  // ajax('cdvfile://localhost/persistent/manifest.json', function (err, res) {
  //   console.log('ajax manifest', err);
  //   if (err) { loadFromApp(); return; }
  //   console.log(res.content);
  // });
  loadFromApp();
})();

