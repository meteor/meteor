var Fiber = Npm.require('fibers');
var url = Npm.require('url');

OAuth = {};
OAuthTest = {};

RoutePolicy.declare('/_oauth/', 'network');

var registeredServices = {};

// Internal: Maps from service version to handler function. The
// 'oauth1' and 'oauth2' packages manipulate this directly to register
// for callbacks.
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


// The state parameter is normally generated on the client using
// `btoa`, but for tests we need a version that runs on the server.
//
OAuth._generateState = function (loginStyle, credentialToken, redirectUrl) {
  return new Buffer(JSON.stringify({
    loginStyle: loginStyle,
    credentialToken: credentialToken,
    redirectUrl: redirectUrl})).toString('base64');
};

OAuth._stateFromQuery = function (query) {
  var string;
  try {
    string = new Buffer(query.state, 'base64').toString('binary');
  } catch (e) {
    Log.warn('Unable to base64 decode state from OAuth query: ' + query.state);
    throw e;
  }

  try {
    return JSON.parse(string);
  } catch (e) {
    Log.warn('Unable to parse state from OAuth query: ' + string);
    throw e;
  }
};

OAuth._loginStyleFromQuery = function (query) {
  var style;
  // For backwards-compatibility for older clients, catch any errors
  // that result from parsing the state parameter. If we can't parse it,
  // set login style to popup by default.
  try {
    style = OAuth._stateFromQuery(query).loginStyle;
  } catch (err) {
    style = "popup";
  }
  if (style !== "popup" && style !== "redirect") {
    throw new Error("Unrecognized login style: " + style);
  }
  return style;
};

OAuth._credentialTokenFromQuery = function (query) {
  var state;
  // For backwards-compatibility for older clients, catch any errors
  // that result from parsing the state parameter. If we can't parse it,
  // assume that the state parameter's value is the credential token, as
  // it used to be for older clients.
  try {
    state = OAuth._stateFromQuery(query);
  } catch (err) {
    return query.state;
  }
  return state.credentialToken;
};

OAuth._isCordovaFromQuery = function (query) {
  try {
    return !! OAuth._stateFromQuery(query).isCordova;
  } catch (err) {
    // For backwards-compatibility for older clients, catch any errors
    // that result from parsing the state parameter. If we can't parse
    // it, assume that we are not on Cordova, since older Meteor didn't
    // do Cordova.
    return false;
  }
};

// Checks if the `redirectUrl` matches the app host.
// We export this function so that developers can override this
// behavior to allow apps from external domains to login using the
// redirect OAuth flow.
OAuth._checkRedirectUrlOrigin = function (redirectUrl) {
  var appHost = Meteor.absoluteUrl();
  var appHostReplacedLocalhost = Meteor.absoluteUrl(undefined, {
    replaceLocalhost: true
  });
  return (
    redirectUrl.substr(0, appHost.length) !== appHost &&
    redirectUrl.substr(0, appHostReplacedLocalhost.length) !== appHostReplacedLocalhost
  );
};


// Listen to incoming OAuth http requests
WebApp.connectHandlers.use(function(req, res, next) {
  // Need to create a Fiber since we're using synchronous http calls and nothing
  // else is wrapping this in a fiber automatically
  Fiber(function () {
    middleware(req, res, next);
  }).run();
});

var middleware = function (req, res, next) {
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
        OAuth._storePendingCredential(OAuth._credentialTokenFromQuery(req.query), err);
      } catch (err) {
        // Ignore the error and just give up. If we failed to store the
        // error, then the login will just fail with a generic error.
        Log.warn("Error in OAuth Server while storing pending login result.\n" +
                 err.stack || err.message);
      }
    }

    // close the popup. because nobody likes them just hanging
    // there.  when someone sees this multiple times they might
    // think to check server logs (we hope?)
    // Catch errors because any exception here will crash the runner.
    try {
      OAuth._endOfLoginResponse(res, {
        query: req.query,
        loginStyle: OAuth._loginStyleFromQuery(req.query),
        error: err
      });
    } catch (err) {
      Log.warn("Error generating end of login response\n" +
               (err && (err.stack || err.message)));
    }
  }
};

OAuthTest.middleware = middleware;

// Handle /_oauth/* paths and extract the service name.
//
// @returns {String|null} e.g. "facebook", or null if this isn't an
// oauth request
var oauthServiceName = function (req) {
  // req.url will be "/_oauth/<service name>" with an optional "?close".
  var i = req.url.indexOf('?');
  var barePath;
  if (i === -1)
    barePath = req.url;
  else
    barePath = req.url.substring(0, i);
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

var isSafe = function (value) {
  // This matches strings generated by `Random.secret` and
  // `Random.id`.
  return typeof value === "string" &&
    /^[a-zA-Z0-9\-_]+$/.test(value);
};

// Internal: used by the oauth1 and oauth2 packages
OAuth._renderOauthResults = function(res, query, credentialSecret) {
  // For tests, we support the `only_credential_secret_for_test`
  // parameter, which just returns the credential secret without any
  // surrounding HTML. (The test needs to be able to easily grab the
  // secret and use it to log in.)
  //
  // XXX only_credential_secret_for_test could be useful for other
  // things beside tests, like command-line clients. We should give it a
  // real name and serve the credential secret in JSON.

  if (query.only_credential_secret_for_test) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.end(credentialSecret, 'utf-8');
  } else {
    var details = {
      query: query,
      loginStyle: OAuth._loginStyleFromQuery(query)
    };
    if (query.error) {
      details.error = query.error;
    } else {
      var token = OAuth._credentialTokenFromQuery(query);
      var secret = credentialSecret;
      if (token && secret &&
          isSafe(token) && isSafe(secret)) {
        details.credentials = { token: token, secret: secret};
      } else {
        details.error = "invalid_credential_token_or_secret";
      }
    }

    OAuth._endOfLoginResponse(res, details);
  }
};

// This "template" (not a real Spacebars template, just an HTML file
// with some ##PLACEHOLDER##s) communicates the credential secret back
// to the main window and then closes the popup.
OAuth._endOfPopupResponseTemplate = Assets.getText(
  "end_of_popup_response.html");

OAuth._endOfRedirectResponseTemplate = Assets.getText(
  "end_of_redirect_response.html");

// Renders the end of login response template into some HTML and JavaScript
// that closes the popup or redirects at the end of the OAuth flow.
//
// options are:
//   - loginStyle ("popup" or "redirect")
//   - setCredentialToken (boolean)
//   - credentialToken
//   - credentialSecret
//   - redirectUrl
//   - isCordova (boolean)
//
var renderEndOfLoginResponse = function (options) {
  // It would be nice to use Blaze here, but it's a little tricky
  // because our mustaches would be inside a <script> tag, and Blaze
  // would treat the <script> tag contents as text (e.g. encode '&' as
  // '&amp;'). So we just do a simple replace.

  var escape = function (s) {
    if (s) {
      return s.replace(/&/g, "&amp;").
        replace(/</g, "&lt;").
        replace(/>/g, "&gt;").
        replace(/\"/g, "&quot;").
        replace(/\'/g, "&#x27;").
        replace(/\//g, "&#x2F;");
    } else {
      return s;
    }
  };

  // Escape everything just to be safe (we've already checked that some
  // of this data -- the token and secret -- are safe).
  var config = {
    setCredentialToken: !! options.setCredentialToken,
    credentialToken: escape(options.credentialToken),
    credentialSecret: escape(options.credentialSecret),
    storagePrefix: escape(OAuth._storageTokenPrefix),
    redirectUrl: escape(options.redirectUrl),
    isCordova: !! options.isCordova
  };

  var template;
  if (options.loginStyle === 'popup') {
    template = OAuth._endOfPopupResponseTemplate;
  } else if (options.loginStyle === 'redirect') {
    template = OAuth._endOfRedirectResponseTemplate;
  } else {
    throw new Error('invalid loginStyle: ' + options.loginStyle);
  }

  var result = template.replace(/##CONFIG##/, JSON.stringify(config))
    .replace(
      /##ROOT_URL_PATH_PREFIX##/, __meteor_runtime_config__.ROOT_URL_PATH_PREFIX
    );

  return "<!DOCTYPE html>\n" + result;
};

// Writes an HTTP response to the popup window at the end of an OAuth
// login flow. At this point, if the user has successfully authenticated
// to the OAuth server and authorized this app, we communicate the
// credentialToken and credentialSecret to the main window. The main
// window must provide both these values to the DDP `login` method to
// authenticate its DDP connection. After communicating these vaues to
// the main window, we close the popup.
//
// We export this function so that developers can override this
// behavior, which is particularly useful in, for example, some mobile
// environments where popups and/or `window.opener` don't work. For
// example, an app could override `OAuth._endOfPopupResponse` to put the
// credential token and credential secret in the popup URL for the main
// window to read them there instead of using `window.opener`. If you
// override this function, you take responsibility for writing to the
// request and calling `res.end()` to complete the request.
//
// Arguments:
//   - res: the HTTP response object
//   - details:
//      - query: the query string on the HTTP request
//      - credentials: { token: *, secret: * }. If present, this field
//        indicates that the login was successful. Return these values
//        to the client, who can use them to log in over DDP. If
//        present, the values have been checked against a limited
//        character set and are safe to include in HTML.
//      - error: if present, a string or Error indicating an error that
//        occurred during the login. This can come from the client and
//        so shouldn't be trusted for security decisions or included in
//        the response without sanitizing it first. Only one of `error`
//        or `credentials` should be set.
OAuth._endOfLoginResponse = function (res, details) {
  res.writeHead(200, {'Content-Type': 'text/html'});

  var redirectUrl;
  if (details.loginStyle === 'redirect') {
    redirectUrl = OAuth._stateFromQuery(details.query).redirectUrl;
    var appHost = Meteor.absoluteUrl();
    if (OAuth._checkRedirectUrlOrigin(redirectUrl)) {
      details.error = "redirectUrl (" + redirectUrl +
        ") is not on the same host as the app (" + appHost + ")";
      redirectUrl = appHost;
    }
  }

  var isCordova = OAuth._isCordovaFromQuery(details.query);

  if (details.error) {
    Log.warn("Error in OAuth Server: " +
             (details.error instanceof Error ?
              details.error.message : details.error));
    res.end(renderEndOfLoginResponse({
      loginStyle: details.loginStyle,
      setCredentialToken: false,
      redirectUrl: redirectUrl,
      isCordova: isCordova
    }), "utf-8");
    return;
  }

  // If we have a credentialSecret, report it back to the parent
  // window, with the corresponding credentialToken. The parent window
  // uses the credentialToken and credentialSecret to log in over DDP.
  res.end(renderEndOfLoginResponse({
    loginStyle: details.loginStyle,
    setCredentialToken: true,
    credentialToken: details.credentials.token,
    credentialSecret: details.credentials.secret,
    redirectUrl: redirectUrl,
    isCordova: isCordova
  }), "utf-8");
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
