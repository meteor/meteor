(function () {
  var connect = __meteor_bootstrap__.require("connect");

  Meteor._routePolicy.declare('/_oauth/', 'network');

  Accounts.oauth._services = {};

  // Register a handler for an OAuth service. The handler will be called
  // when we get an incoming http request on /_oauth/{serviceName}. This
  // handler should use that information to fetch data about the user
  // logging in.
  //
  // @param name {String} e.g. "google", "facebook"
  // @param version {Number} OAuth version (1 or 2)
  // @param handleOauthRequest {Function(oauthBinding|query)}
  //   - (For OAuth1 only) oauthBinding {OAuth1Binding} bound to the appropriate provider
  //   - (For OAuth2 only) query {Object} parameters passed in query string
  //   - return value is:
  //     - {serviceData:, (optional options:)} where serviceData should end
  //       up in the user's services[name] field
  //     - `null` if the user declined to give permissions
  Accounts.oauth.registerService = function (name, version, handleOauthRequest) {
    if (Accounts.oauth._services[name])
      throw new Error("Already registered the " + name + " OAuth service");

    // Accounts.updateOrCreateUserFromExternalService does a lookup by this id,
    // so this should be a unique index. You might want to add indexes for other
    // fields returned by your service (eg services.github.login) but you can do
    // that in your app.
    Meteor.users._ensureIndex('services.' + name + '.id',
                              {unique: 1, sparse: 1});

    Accounts.oauth._services[name] = {
      serviceName: name,
      version: version,
      handleOauthRequest: handleOauthRequest
    };
  };

  // When we get an incoming OAuth http request we complete the oauth
  // handshake, account and token setup before responding.  The
  // results are stored in this map which is then read when the login
  // method is called. Maps state --> return value of `login`
  //
  // XXX we should periodically clear old entries
  Accounts.oauth._loginResultForState = {};

  // Listen to calls to `login` with an oauth option set
  Accounts.registerLoginHandler(function (options) {
    if (!options.oauth)
      return undefined; // don't handle

    var result = Accounts.oauth._loginResultForState[options.oauth.state];
    if (!result) {
      // OAuth state is not recognized, which could be either because the popup
      // was closed by the user before completion, or some sort of error where
      // the oauth provider didn't talk to our server correctly and closed the
      // popup somehow.
      //
      // we assume it was user canceled, and report it as such, using a
      // Meteor.Error which the client can recognize. this will mask failures
      // where things are misconfigured such that the server doesn't see the
      // request but does close the window. This seems unlikely.
      throw new Meteor.Error(Accounts.LoginCancelledError.numericError,
                             'No matching login attempt found');
    } else if (result instanceof Error)
      // We tried to login, but there was a fatal error. Report it back
      // to the user.
      throw result;
    else
      return result;
  });

  var Fiber = __meteor_bootstrap__.require('fibers');
  // Listen to incoming OAuth http requests
  __meteor_bootstrap__.app
    .use(connect.query())
    .use(function(req, res, next) {
      // Need to create a Fiber since we're using synchronous http
      // calls and nothing else is wrapping this in a fiber
      // automatically
      Fiber(function () {
        Accounts.oauth._middleware(req, res, next);
      }).run();
    });

  Accounts.oauth._middleware = function (req, res, next) {
    // Make sure to catch any exceptions because otherwise we'd crash
    // the runner
    try {
      var serviceName = oauthServiceName(req);
      if (!serviceName) {
        // not an oauth request. pass to next middleware.
        next();
        return;
      }

      var service = Accounts.oauth._services[serviceName];

      // Skip everything if there's no service set by the oauth middleware
      if (!service)
        throw new Error("Unexpected OAuth service " + serviceName);

      // Make sure we're configured
      ensureConfigured(serviceName);

      if (service.version === 1)
        Accounts.oauth1._handleRequest(service, req.query, res);
      else if (service.version === 2)
        Accounts.oauth2._handleRequest(service, req.query, res);
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
        Accounts.oauth._loginResultForState[req.query.state] = err;

      // also log to the server console, so the developer sees it.
      Meteor._debug("Exception in oauth request handler", err);

      // XXX the following is actually wrong. if someone wants to
      // redirect rather than close once we are done with the OAuth
      // flow, as supported by
      // Accounts.oauth_renderOauthResults, this will still
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
    if (!Accounts.loginServiceConfiguration.findOne({service: serviceName})) {
      throw new Accounts.ConfigError("Service not configured");
    };
  };

  Accounts.oauth._renderOauthResults = function(res, query) {
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

})();


