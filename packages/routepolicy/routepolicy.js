// In addition to listing specific files to be cached, the browser
// application cache manifest allows URLs to be designated as NETWORK
// (always fetched from the Internet) and FALLBACK (which we use to
// serve app HTML on arbitrary URLs).
//
// The limitation of the manifest file format is that the designations
// are by prefix only: if "/foo" is declared NETWORK then "/foobar"
// will also be treated as a network route.
//
// RoutePolicy is a low-level API for declaring the route type of URL prefixes:
//
// "network": for network routes that should not conflict with static
// resources.  (For example, if "/sockjs/" is a network route, we
// shouldn't have "/sockjs/red-sock.jpg" as a static resource).
//
// "static-online": for static resources which should not be cached in
// the app cache.  This is implemented by also adding them to the
// NETWORK section (as otherwise the browser would receive app HTML
// for them because of the FALLBACK section), but static-online routes
// don't need to be checked for conflict with static resources.

// The route policy is a singleton in a running application, but we
// can't unit test the real singleton because messing with the real
// routes would break tinytest... so allow policy instances to be
// constructed for testing.

RoutePolicyTest = {};

var RoutePolicyConstructor = RoutePolicyTest.Constructor = function () {
  var self = this;
  self.urlPrefixTypes = {};
};

_.extend(RoutePolicyConstructor.prototype, {

  urlPrefixMatches: function (urlPrefix, url) {
    return url.substr(0, urlPrefix.length) === urlPrefix;
  },

  checkType: function (type) {
    if (! _.contains(['network', 'static-online'], type))
      return 'the route type must be "network" or "static-online"';
    return null;
  },

  checkUrlPrefix: function (urlPrefix, type) {
    var self = this;

    if (urlPrefix.charAt(0) !== '/')
      return 'a route URL prefix must begin with a slash';

    if (urlPrefix === '/')
      return 'a route URL prefix cannot be /';

    var existingType = self.urlPrefixTypes[urlPrefix];
    if (existingType && existingType !== type)
      return 'the route URL prefix ' + urlPrefix + ' has already been declared to be of type ' + existingType;

    return null;
  },

  checkForConflictWithStatic: function (urlPrefix, type, _testManifest) {
    var self = this;
    if (type === 'static-online')
      return null;
    if (!Package.webapp || !Package.webapp.WebApp
        || !Package.webapp.WebApp.clientPrograms
        || !Package.webapp.WebApp.clientPrograms[Package.webapp.WebApp.defaultArch].manifest) {
      // Hack: If we don't have a manifest, deal with it
      // gracefully. This lets us load livedata into a nodejs
      // environment that doesn't have a HTTP server (eg, a
      // command-line tool).
      return null;
    }
    var manifest = _testManifest ||
      Package.webapp.WebApp.clientPrograms[Package.webapp.WebApp.defaultArch].manifest;
    var conflict = _.find(manifest, function (resource) {
      return (resource.type === 'static' &&
              resource.where === 'client' &&
              self.urlPrefixMatches(urlPrefix, resource.url));
    });
    if (conflict)
      return ('static resource ' + conflict.url + ' conflicts with ' +
              type + ' route ' + urlPrefix);
    else
      return null;
  },

  declare: function (urlPrefix, type) {
    var self = this;
    var problem = self.checkType(type) ||
                  self.checkUrlPrefix(urlPrefix, type) ||
                  self.checkForConflictWithStatic(urlPrefix, type);
    if (problem)
      throw new Error(problem);
    // TODO overlapping prefixes, e.g. /foo/ and /foo/bar/
    self.urlPrefixTypes[urlPrefix] = type;
  },

  isValidUrl: function (url) {
    return url.charAt(0) === '/';
  },

  classify: function (url) {
    var self = this;
    if (url.charAt(0) !== '/')
      throw new Error('url must be a relative URL: ' + url);
    var prefix = _.find(_.keys(self.urlPrefixTypes), function (_prefix) {
      return self.urlPrefixMatches(_prefix, url);
    });
    if (prefix)
      return self.urlPrefixTypes[prefix];
    else
      return null;
  },

  urlPrefixesFor: function (type) {
    var self = this;
    var prefixes = [];
    _.each(self.urlPrefixTypes, function (_type, _prefix) {
      if (_type === type)
        prefixes.push(_prefix);
    });
    return prefixes.sort();
  }
});

RoutePolicy = new RoutePolicyConstructor();
