var Fiber = Npm.require('fibers');
var url = Npm.require('url');

OAuth = {};
OAuthTest = {};

RoutePolicy.declare('/_oauth/', 'network');

var registeredServices = {};

// Internal: Maps from service version to handler function. The
// 'oauth1' and 'oauth2' packages manipulate this directly to register
// for callbacks.
//
OAuth._requestHandlers = {};


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
//
OAuth.registerService = function (name, version, urls, handleOauthRequest) {
  if (registeredServices[name])
    throw new Error("Already registered the " + name + " OAuth service");

  registeredServices[name] = {
    serviceName: name,
    version: version,
    urls: urls,
    handleOauthRequest: handleOauthRequest
  };
};

// For test cleanup.
OAuthTest.unregisterService = function (name) {
  delete registeredServices[name];
};


OAuth.retrieveCredential = function(credentialToken, credentialSecret) {
  return OAuth._retrievePendingCredential(credentialToken, credentialSecret);
};


// Listen to incoming OAuth http requests
WebApp.connectHandlers.use(function(req, res, next) {
  // Need to create a Fiber since we're using synchronous http calls and nothing
  // else is wrapping this in a fiber automatically
  Fiber(function () {
    middleware(req, res, next);
  }).run();
});

middleware = function (req, res, next) {
  // Make sure to catch any exceptions because otherwise we'd crash
  // the runner
  try {
    var serviceName = oauthServiceName(req);
    if (!serviceName) {
      // not an oauth request. pass to next middleware.
      next();
      return;
    }

    var service = registeredServices[serviceName];

    // Skip everything if there's no service set by the oauth middleware
    if (!service)
      throw new Error("Unexpected OAuth service " + serviceName);

    // Make sure we're configured
    ensureConfigured(serviceName);

    var handler = OAuth._requestHandlers[service.version];
    if (!handler)
      throw new Error("Unexpected OAuth version " + service.version);
    handler(service, req.query, res);
  } catch (err) {
    // if we got thrown an error, save it off, it will get passed to
    // the appropriate login call (if any) and reported there.
    //
    // The other option would be to display it in the popup tab that
    // is still open at this point, ignoring the 'close' or 'redirect'
    // we were passed. But then the developer wouldn't be able to
    // style the error or react to it in any way.
    if (req.query.state && err instanceof Error) {
      try { // catch any exceptions to avoid crashing runner
        OAuth._storePendingCredential(req.query.state, err);
      } catch (err) {
        // Ignore the error and just give up. If we failed to store the
        // error, then the login will just fail with a generic error.
        Log.warn("Error in OAuth Server while storing pending login result.\n" +
                 err.stack || err.message);
      }
    }

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
    OAuth._endOfLoginResponse(res);
  }
};

OAuthTest.middleware = middleware;

// Handle /_oauth/* paths and extract the service name.
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
    throw new ServiceConfiguration.ConfigError();
  }
};

// Internal: used by the oauth1 and oauth2 packages
OAuth._renderOauthResults = function(res, query, credentialSecret) {
  // We support ?close and ?redirect=URL. Any other query should just
  // serve a blank page. For tests, we support the
  // `only_credential_secret_for_test` parameter, which just returns the
  // credential secret without any surrounding HTML. (The test needs to
  // be able to easily grab the secret and use it to log in.)
  //
  // XXX only_credential_secret_for_test could be useful for other
  // things beside tests, like command-line clients. We should give it a
  // real name and serve the credential secret in JSON.
  if (query.only_credential_secret_for_test) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(credentialSecret, 'utf-8');
  } else if (query.error) {
    Log.warn("Error in OAuth Server: " + query.error);
    OAuth._endOfLoginResponse(res);
  } else if ('close' in query) { // check with 'in' because we don't set a value
    OAuth._endOfLoginResponse(res, query.state, credentialSecret);
  } else if (query.redirect) {
    // Only redirect to URLs on the same domain as this app.
    // XXX No code in core uses this code path right now.
    // XXX In order for the redirect flow to be fully supported, we'd
    // have to communicate the credentialSecret back to the app somehow.
    var redirectHostname = url.parse(query.redirect).hostname;
    var appHostname = url.parse(Meteor.absoluteUrl()).hostname;
    if (appHostname === redirectHostname) {
      // We rely on node to make sure the header is really only a single header
      // (not, for example, a url with a newline and then another header).
      res.writeHead(302, {'Location': query.redirect});
    } else {
      res.writeHead(400);
    }
    res.end();
  } else {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end('', 'utf-8');
  }
};

OAuth._endOfLoginResponse = function(res, credentialToken, credentialSecret) {

  var isSafe = function (value) {
    // This matches strings generated by `Random.secret` and
    // `Random.id`.
    return typeof value === "string" &&
      /^[a-zA-Z0-9\-_]+$/.test(value);
  };

  res.writeHead(200, {'Content-Type': 'text/html'});
  // If we have a credentialSecret, report it back to the parent window,
  // with the corresponding credentialToken (which we sanitize because
  // it came from a query parameter). The parent window uses the
  // credentialToken and credential secret to log in over DDP.
  var setCredentialSecret = '';
  if (credentialToken && credentialSecret &&
      isSafe(credentialToken) && isSafe(credentialSecret)) {
    setCredentialSecret = 'window.opener && ' +
      'window.opener.Package.oauth.OAuth._handleCredentialSecret(' +
      JSON.stringify(credentialToken) + ', ' +
      JSON.stringify(credentialSecret) + ');';
  }
  var content =
        '<html><head><script>' +
        setCredentialSecret +
        'window.close()</script></head></html>';
  res.end(content, 'utf-8');
};


var OAuthEncryption = Package["oauth-encryption"] && Package["oauth-encryption"].OAuthEncryption;

var usingOAuthEncryption = function () {
  return OAuthEncryption && OAuthEncryption.keyIsLoaded();
};

// Encrypt sensitive service data such as access tokens if the
// "oauth-encryption" package is loaded and the oauth secret key has
// been specified.  Returns the unencrypted plaintext otherwise.
//
// The user id is not specified because the user isn't known yet at
// this point in the oauth authentication process.  After the oauth
// authentication process completes the encrypted service data fields
// will be re-encrypted with the user id included before inserting the
// service data into the user document.
//
OAuth.sealSecret = function (plaintext) {
  if (usingOAuthEncryption())
    return OAuthEncryption.seal(plaintext);
  else
    return plaintext;
}

// Unencrypt a service data field, if the "oauth-encryption"
// package is loaded and the field is encrypted.
//
// Throws an error if the "oauth-encryption" package is loaded and the
// field is encrypted, but the oauth secret key hasn't been specified.
//
OAuth.openSecret = function (maybeSecret, userId) {
  if (!Package["oauth-encryption"] || !OAuthEncryption.isSealed(maybeSecret))
    return maybeSecret;

  return OAuthEncryption.open(maybeSecret, userId);
};

// Unencrypt fields in the service data object.
//
OAuth.openSecrets = function (serviceData, userId) {
  var result = {};
  _.each(_.keys(serviceData), function (key) {
    result[key] = OAuth.openSecret(serviceData[key], userId);
  });
  return result;
};
