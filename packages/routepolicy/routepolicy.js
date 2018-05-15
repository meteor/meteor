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


export default class RoutePolicy {
  constructor() {
    // maps prefix to a type
    this.urlPrefixTypes = {};
  }

  urlPrefixMatches(urlPrefix, url) {
    return url.startsWith(urlPrefix);
  }

  checkType(type) {
    if (!['network', 'static-online'].includes(type)) {
      return 'the route type must be "network" or "static-online"';
    }
    return null;
  }

  checkUrlPrefix(urlPrefix, type) {
    if (!urlPrefix.startsWith('/')) {
      return 'a route URL prefix must begin with a slash';
    }

    if (urlPrefix === '/') {
      return 'a route URL prefix cannot be /';
    }

    const existingType = this.urlPrefixTypes[urlPrefix];
    if (existingType && existingType !== type) {
      return `the route URL prefix ${urlPrefix} has already been declared ` +
        `to be of type ${existingType}`;
    }

    return null;
  }

  checkForConflictWithStatic(urlPrefix, type, _testManifest) {
    if (type === 'static-online') {
      return null;
    }

    if (!Package.webapp ||
        !Package.webapp.WebApp ||
        !Package.webapp.WebApp.clientPrograms ||
        !Package.webapp.WebApp.clientPrograms[
          Package.webapp.WebApp.defaultArch].manifest) {
      // Hack: If we don't have a manifest, deal with it
      // gracefully. This lets us load livedata into a nodejs
      // environment that doesn't have a HTTP server (eg, a
      // command-line tool).
      return null;
    }

    const WebApp = Package.webapp.WebApp;
    const manifest =
      _testManifest || WebApp.clientPrograms[WebApp.defaultArch].manifest;
    const conflict = manifest.find(resource => (
      resource.type === 'static' &&
      resource.where === 'client' &&
      this.urlPrefixMatches(urlPrefix, resource.url)
    ));

    if (conflict) {
      return `static resource ${conflict.url} conflicts with ${type} ` +
        `route ${urlPrefix}`;
    }
    return null;
  }

  declare(urlPrefix, type) {
    const problem =
      this.checkType(type) ||
      this.checkUrlPrefix(urlPrefix, type) ||
      this.checkForConflictWithStatic(urlPrefix, type);
    if (problem) {
      throw new Error(problem);
    }
    // TODO overlapping prefixes, e.g. /foo/ and /foo/bar/
    this.urlPrefixTypes[urlPrefix] = type;
  }

  isValidUrl(url) {
    return url.startsWith('/');
  }

  classify(url) {
    if (!this.isValidUrl(url)) {
      throw new Error(`url must be a relative URL: ${url}`);
    }

    const prefix = Object.keys(this.urlPrefixTypes).find(prefix =>
      this.urlPrefixMatches(prefix, url)
    );

    return prefix ? this.urlPrefixTypes[prefix] : null;
  }

  urlPrefixesFor(type) {
    return Object.entries(this.urlPrefixTypes)
      .filter(([_prefix, _type]) => _type === type)
      .map(([_prefix]) => _prefix)
      .sort();
  }
}
