var crypto = Npm.require('crypto');
var fs = Npm.require('fs');
var path = Npm.require('path');

var _disableSizeCheck = false;

Meteor.AppCache = {
  config: function (options) {
    _.each(options, function (value, option) {
      if (option === 'browsers') {
        disabledBrowsers = {};
        _.each(value, function (browser) {
          disabledBrowsers[browser] = false;
        });
      }
      else if (option === 'onlineOnly') {
        _.each(value, function (urlPrefix) {
          RoutePolicy.declare(urlPrefix, 'static-online');
        });
      }
      // option to suppress warnings for tests.
      else if (option === '_disableSizeCheck') {
        _disableSizeCheck = value;
      }
      else if (value === false) {
        disabledBrowsers[option] = true;
      }
      else if (value === true) {
        disabledBrowsers[option] = false;
      } else {
        throw new Error('Invalid AppCache config option: ' + option);
      }
    });
  }
};

var disabledBrowsers = {};
var browserDisabled = function (request) {
  return disabledBrowsers[request.browser.name];
};

WebApp.addHtmlAttributeHook(function (request) {
  if (browserDisabled(request))
    return null;
  else
    return { manifest: "/app.manifest" };
});

WebApp.connectHandlers.use(function (req, res, next) {
  if (req.url !== '/app.manifest') {
    return next();
  }

  // Browsers will get confused if we unconditionally serve the
  // manifest and then disable the app cache for that browser.  If
  // the app cache had previously been enabled for a browser, it
  // will continue to fetch the manifest as long as it's available,
  // even if we now are not including the manifest attribute in the
  // app HTML.  (Firefox for example will continue to display "this
  // website is asking to store data on your computer for offline
  // use").  Returning a 404 gets the browser to really turn off the
  // app cache.

  if (browserDisabled(WebApp.categorizeRequest(req))) {
    res.writeHead(404);
    res.end();
    return;
  }

  var manifest = "CACHE MANIFEST\n\n";

  // After the browser has downloaded the app files from the server and
  // has populated the browser's application cache, the browser will
  // *only* connect to the server and reload the application if the
  // *contents* of the app manifest file has changed.
  //
  // So to ensure that the client updates if client resources change,
  // include a hash of client resources in the manifest.

  manifest += "# " + WebApp.clientHash() + "\n";

  // When using the autoupdate package, also include
  // AUTOUPDATE_VERSION.  Otherwise the client will get into an
  // infinite loop of reloads when the browser doesn't fetch the new
  // app HTML which contains the new version, and autoupdate will
  // reload again trying to get the new code.

  if (Package.autoupdate) {
    var version = Package.autoupdate.Autoupdate.autoupdateVersion;
    if (version !== WebApp.clientHash())
      manifest += "# " + version + "\n";
  }

  manifest += "\n";

  manifest += "CACHE:" + "\n";
  manifest += "/" + "\n";
  _.each(WebApp.clientPrograms[WebApp.defaultArch].manifest, function (resource) {
    if (resource.where === 'client' &&
        ! RoutePolicy.classify(resource.url)) {
      manifest += resource.url;
      // If the resource is not already cacheable (has a query
      // parameter, presumably with a hash or version of some sort),
      // put a version with a hash in the cache.
      //
      // Avoid putting a non-cacheable asset into the cache, otherwise
      // the user can't modify the asset until the cache headers
      // expire.
      if (!resource.cacheable)
        manifest += "?" + resource.hash;

      manifest += "\n";
    }
  });
  manifest += "\n";

  manifest += "FALLBACK:\n";
  manifest += "/ /" + "\n";
  // Add a fallback entry for each uncacheable asset we added above.
  //
  // This means requests for the bare url (/image.png instead of
  // /image.png?hash) will work offline. Online, however, the browser
  // will send a request to the server. Users can remove this extra
  // request to the server and have the asset served from cache by
  // specifying the full URL with hash in their code (manually, with
  // some sort of URL rewriting helper)
  _.each(WebApp.clientPrograms[WebApp.defaultArch].manifest, function (resource) {
    if (resource.where === 'client' &&
        ! RoutePolicy.classify(resource.url) &&
        !resource.cacheable) {
      manifest += resource.url + " " + resource.url +
        "?" + resource.hash + "\n";
    }
  });

  manifest += "\n";

  manifest += "NETWORK:\n";
  // TODO adding the manifest file to NETWORK should be unnecessary?
  // Want more testing to be sure.
  manifest += "/app.manifest" + "\n";
  _.each(
    [].concat(
      RoutePolicy.urlPrefixesFor('network'),
      RoutePolicy.urlPrefixesFor('static-online')
    ),
    function (urlPrefix) {
      manifest += urlPrefix + "\n";
    }
  );
  manifest += "*" + "\n";

  // content length needs to be based on bytes
  var body = new Buffer(manifest);

  res.setHeader('Content-Type', 'text/cache-manifest');
  res.setHeader('Content-Length', body.length);
  return res.end(body);
});

var sizeCheck = function () {
  var totalSize = 0;
  _.each(WebApp.clientPrograms[WebApp.defaultArch].manifest, function (resource) {
    if (resource.where === 'client' &&
        ! RoutePolicy.classify(resource.url)) {
      totalSize += resource.size;
    }
  });
  if (totalSize > 5 * 1024 * 1024) {
    Meteor._debug(
      "** You are using the appcache package but the total size of the\n" +
      "** cached resources is " +
      (totalSize / 1024 / 1024).toFixed(1) + "MB.\n" +
      "**\n" +
      "** This is over the recommended maximum of 5 MB and may break your\n" +
      "** app in some browsers! See http://docs.meteor.com/#appcache\n" +
      "** for more information and fixes.\n"
    );
  }
};

// Run the size check after user code has had a chance to run. That way,
// the size check can take into account files that the user does not
// want cached. Otherwise, the size check warning will still print even
// if the user excludes their large files with
// `Meteor.AppCache.config({onlineOnly: files})`.
Meteor.startup(function () {
  if (! _disableSizeCheck)
    sizeCheck();
});
