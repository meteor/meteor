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
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function () {
      if (xhr.readyState < 4)
        return;

      if (xhr.status >= 300)
        cb(xhr.status, null);
      else
        cb(null, xhr);
    };
    xhr.open('GET', url, true);
    xhr.send();
  };

  // fall-back
  var loadFromApp = function () {
    each(__jsUrlsToLoad, function (url) {
      var script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = url;

      document.getElementsByTagName('head')[0].appendChild(script);
    });
  };

  ajax('cdvfile://localhost/persistent/manifest.json', function (err, res) {
    console.log('ajax manifest', err)
    if (err) { loadFromApp(); return; }
    console.log(res.content);
  });
})();

