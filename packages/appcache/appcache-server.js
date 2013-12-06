var crypto = Npm.require('crypto');
var fs = Npm.require('fs');
var path = Npm.require('path');

var knownBrowsers = [
  'android',
  'chrome',
  'chromium',
  'chromeMobileIOS',
  'firefox',
  'ie',
  'mobileSafari',
  'safari'
];

var browsersEnabledByDefault = [
  'android',
  'chrome',
  'chromium',
  'chromeMobileIOS',
  'ie',
  'mobileSafari',
  'safari'
];

var enabledBrowsers = {};
_.each(browsersEnabledByDefault, function (browser) {
  enabledBrowsers[browser] = true;
});

Meteor.AppCache = {
  config: function(options) {
    _.each(options, function (value, option) {
      if (option === 'browsers') {
        enabledBrowsers = {};
        _.each(value, function (browser) {
          enabledBrowsers[browser] = true;
        });
      }
      else if (_.contains(knownBrowsers, option)) {
        enabledBrowsers[option] = value;
      }
      else if (option === 'onlineOnly') {
        _.each(value, function (urlPrefix) {
          RoutePolicy.declare(urlPrefix, 'static-online');
        });
      }
      else {
        throw new Error('Invalid AppCache config option: ' + option);
      }
    });
  }
};

var browserEnabled = function(request) {
  return enabledBrowsers[request.browser.name];
};

WebApp.addHtmlAttributeHook(function (request) {
  if (browserEnabled(request))
    return 'manifest="/app.manifest"';
  else
    return null;
});

WebApp.connectHandlers.use(function(req, res, next) {
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

  if (!browserEnabled(WebApp.categorizeRequest(req))) {
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

  manifest += "# " + WebApp.clientHash + "\n";

  // When using the autoupdate package, also include
  // AUTOUPDATE_VERSION.  Otherwise the client will get into an
  // infinite loop of reloads when the browser doesn't fetch the new
  // app HTML which contains the new version, and autoupdate will
  // reload again trying to get the new code.

  if (Package.autoupdate) {
    var version = Package.autoupdate.Autoupdate.autoupdateVersion;
    if (version !== WebApp.clientHash)
      manifest += "# " + version + "\n";
  }

  manifest += "\n";

  manifest += "CACHE:" + "\n";
  manifest += "/" + "\n";
  _.each(WebApp.clientProgram.manifest, function (resource) {
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
  _.each(WebApp.clientProgram.manifest, function (resource) {
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

var sizeCheck = function() {
  var totalSize = 0;
  _.each(WebApp.clientProgram.manifest, function (resource) {
    if (resource.cacheable && resource.where === 'client') {
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

sizeCheck();
