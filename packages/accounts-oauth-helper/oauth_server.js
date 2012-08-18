(function () {
  var connect = __meteor_bootstrap__.require("connect");

  Meteor.accounts.oauth._services = {};

  // Register a handler for an OAuth service. The handler will be called
  // when we get an incoming http request on /_oauth/{serviceName}. This
  // handler should use that information to fetch data about the user
  // logging in.
  //
  // @param name {String} e.g. "google", "facebook"
  // @param version {Number} OAuth version (1 or 2)
  // @param handleOauthRequest {Function(query)}
  //   - query is an object with the parameters passed in the query string
  //   - return value is:
  //     - {options: (options), extra: (optional extra)} (same as the
  //       arguments to Meteor.accounts.updateOrCreateUser)
  //     - `null` if the user declined to give permissions
  Meteor.accounts.oauth.registerService = function (name, version, handleOauthRequest) {
    if (Meteor.accounts.oauth._services[name])
      throw new Error("Already registered the " + name + " OAuth service");

    Meteor.accounts.oauth._services[name] = {
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
  Meteor.accounts.oauth._loginResultForState = {};

  // Listen to calls to `login` with an oauth option set
  Meteor.accounts.registerLoginHandler(function (options) {
    if (!options.oauth)
      return undefined; // don't handle

    var result = Meteor.accounts.oauth._loginResultForState[options.oauth.state];
    if (result === undefined) // not using `!result` since can be null
      // We weren't notified of the user authorizing the login.
      return null;
    else
      return result;
  });

  // Listen to incoming OAuth http requests
  __meteor_bootstrap__.app
    .use(connect.query())
    .use(function(req, res, next) {
      // Need to create a Fiber since we're using synchronous http
      // calls and nothing else is wrapping this in a fiber
      // automatically
      Fiber(function () {
        middleware(req, res, next);
      }).run();
    });

  var middleware = function (req, res, next) {
    var serviceName = requestServiceName(req);
    if (!serviceName) {
      // not an oauth request. pass to next middleware.
      next();
      return;
    }

    var service = Meteor.accounts.oauth._services[serviceName];

    // Skip everything if there's no service set by the oauth middleware
    // XXX should we instead throw an error?
    // XXX we should catch all exceptions here as we do in oauth2_server.js
    if (!service) {
      next();
      return;
    }

    // Make sure we're configured
    ensureConfigured(serviceName);

    if (service.version === 1)
      Meteor.accounts.oauth1._handleRequest(service, req.query, res);
    else if (service.version === 2)
      Meteor.accounts.oauth2._handleRequest(service, req.query, res);
    else
      throw new Error("Unexpected OAuth version " + service.version);
  };

  // Handle _oauth paths, gets a bunch of stuff ready for the oauth implementation middleware
  //
  // @returns {String|null} e.g. "facebook", or null if this isn't an
  // oauth request
  var requestServiceName = function (req) {

    // req.url will be "/_oauth/<service name>?<action>"
    var barePath = req.url.substring(0, req.url.indexOf('?'));
    var splitPath = barePath.split('/');

    // Find service based on url
    var serviceName = splitPath[2];

    // Any non-oauth request will continue down the default middlewares
    // Same goes for service that hasn't been registered
    if (splitPath[1] !== '_oauth') {
      return null;
    }

    return serviceName;
  };

  // Make sure we're configured
  var ensureConfigured = function(serviceName) {
    var service = Meteor.accounts[serviceName];

    _.each(Meteor.accounts[serviceName]._requireConfigs, function(key) {
      var configKey = '_' + key;
      if (!service[configKey])
        throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts." + serviceName + ".config first");
    });

    if (!service._secret)
      throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts." + serviceName + ".setSecret first");
  };

})();


