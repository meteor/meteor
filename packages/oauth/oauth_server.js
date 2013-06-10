var connect = Npm.require("connect");
var Fiber = Npm.require('fibers');

Meteor._routePolicy.declare('/_oauth/', 'network');

Oauth._services = {};


// Register a handler for an OAuth service. The handler will be called
// when we get an incoming http request on /_oauth/{serviceName}. This
// handler should use that information to fetch data about the user
// logging in.
//
// @param name {String} e.g. "google", "facebook"
// @param version {Number} OAuth version (1 or 2)
// @param urls   For OAuth1 only, specify the service's urls
// @param handleOauthRequest {Function(oauthBinding|query)}
//   - (For OAuth1 only) oauthBinding {OAuth1Binding} bound to the appropriate provider
//   - (For OAuth2 only) query {Object} parameters passed in query string
//   - return value is:
//     - {serviceData:, (optional options:)} where serviceData should end
//       up in the user's services[name] field
//     - `null` if the user declined to give permissions
Oauth.registerService = function (name, version, urls, handleOauthRequest) {
  if (Oauth._services[name])
    throw new Error("Already registered the " + name + " OAuth service");

  Oauth._services[name] = {
    serviceName: name,
    version: version,
    urls: urls,
    handleOauthRequest: handleOauthRequest
  };
};

// For test cleanup only.
Oauth._unregisterService = function (name) {
  delete Oauth._services[name];
};


// When we get an incoming OAuth http request we complete the oauth
// handshake, account and token setup before responding.  The
// results are stored in this map which is then read when the login
// method is called. Maps credentialToken --> return value of `login`
//
// XXX we should periodically clear old entries
Oauth._loginResultForCredentialToken = {};

Oauth.hasCredential = function(credentialToken) {
  return _.has(Oauth._loginResultForCredentialToken, credentialToken);
}

Oauth.retrieveCredential = function(credentialToken) {
  result = Oauth._loginResultForCredentialToken[credentialToken];
  delete Oauth._loginResultForCredentialToken[credentialToken];
  return result;
}

// Listen to incoming OAuth http requests
__meteor_bootstrap__.app
  .use(connect.query())
  .use(function(req, res, next) {
    // Need to create a Fiber since we're using synchronous http
    // calls and nothing else is wrapping this in a fiber
    // automatically
    Fiber(function () {
      Oauth._middleware(req, res, next);
    }).run();
  });


Oauth._middleware = function (req, res, next) {
  // Make sure to catch any exceptions because otherwise we'd crash
  // the runner
  try {
    var serviceName = oauthServiceName(req);
    if (!serviceName) {
      // not an oauth request. pass to next middleware.
      next();
      return;
    }

    var service = Oauth._services[serviceName];

    // Skip everything if there's no service set by the oauth middleware
    if (!service)
      throw new Error("Unexpected OAuth service " + serviceName);

    // Make sure we're configured
    ensureConfigured(serviceName);

    if (service.version === 1)
      Oauth1._handleRequest(service, req.query, res);
    else if (service.version === 2)
      Oauth2._handleRequest(service, req.query, res);
    else
      throw new Error("Unexpected OAuth version " + service.version);
  } catch (err) {
    // if we got thrown an error, save it off, it will get passed to
    // the approporiate login call (if any) and reported there.
    //
    // The other option would be to display it in the popup tab that
    // is still open at this point, ignoring the 'close' or 'redirect'
    // we were passed. But then the developer wouldn't be able to
    // style the error or react to it in any way.
    if (req.query.state && err instanceof Error)
      Oauth._loginResultForCredentialToken[req.query.state] = err;

    // XXX the following is actually wrong. if someone wants to
    // redirect rather than close once we are done with the OAuth
    // flow, as supported by
    // Oauth_renderOauthResults, this will still
    // close the popup instead. Once we fully support the redirect
    // flow (by supporting that in places such as
    // packages/facebook/facebook_client.js) we should revisit this.
    //
    // close the popup. because nobody likes them just hanging
    // there.  when someone sees this multiple times they might
    // think to check server logs (we hope?)
    closePopup(res);
  }
};

// Handle /_oauth/* paths and extract the service name
//
// @returns {String|null} e.g. "facebook", or null if this isn't an
// oauth request
var oauthServiceName = function (req) {
  // req.url will be "/_oauth/<service name>?<action>"
  var barePath = req.url.substring(0, req.url.indexOf('?'));
  var splitPath = barePath.split('/');

  // Any non-oauth request will continue down the default
  // middlewares.
  if (splitPath[1] !== '_oauth')
    return null;

  // Find service based on url
  var serviceName = splitPath[2];
  return serviceName;
};

// Make sure we're configured
var ensureConfigured = function(serviceName) {
  if (!ServiceConfiguration.configurations.findOne({service: serviceName})) {
    throw new ServiceConfiguration.ConfigError("Service not configured");
  };
};

Oauth._renderOauthResults = function(res, query) {
  // We support ?close and ?redirect=URL. Any other query should
  // just serve a blank page
  if ('close' in query) { // check with 'in' because we don't set a value
    closePopup(res);
  } else if (query.redirect) {
    res.writeHead(302, {'Location': query.redirect});
    res.end();
  } else {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end('', 'utf-8');
  }
};

var closePopup = function(res) {
  res.writeHead(200, {'Content-Type': 'text/html'});
  var content =
        '<html><head><script>window.close()</script></head></html>';
  res.end(content, 'utf-8');
};

