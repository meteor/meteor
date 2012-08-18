(function () {
  var connect = __meteor_bootstrap__.require("connect");

  // Register a handler for an OAuth service. The handler will be called
  // when we get an incoming http request on /_oauth/{serviceName}. This
  // handler should use that information to fetch data about the user
  // logging in.
  //
  // @param name {String} e.g. "google", "facebook"
  // @param handleOauthRequest {Function(query)}
  //   - query is an object with the parameters passed in the query string
  //   - return value is:
  //     - {options: (options), extra: (optional extra)} (same as the
  //       arguments to Meteor.accounts.updateOrCreateUser)
  //     - `null` if the user declined to give permissions
  Meteor.accounts.oauth.registerService = function (name, options, handleOauthRequest) {
    var oauthAccounts = Meteor.accounts['oauth' + options.version];

    if (oauthAccounts._services[name])
      throw new Error("Already registered the " + name + " OAuth" + options.version + " service");

    oauthAccounts._services[name] = {
      handleOauthRequest: handleOauthRequest
    };
  };

  Meteor.accounts.oauth._setup = function(setupOptions) {
    var oauthAccounts = Meteor.accounts['oauth' + setupOptions.version];

    // Listen to calls to `login` with an oauth option set
    Meteor.accounts.registerLoginHandler(function (options) {
      if (!options.oauth || options.oauth.version !== setupOptions.version)
        return undefined; // don't handle

      var result = oauthAccounts._loginResultForState[options.oauth.state];
      if (result === undefined) // not using `!result` since can be null
        // We weren't notified of the user authorizing the login.
        return null;
      else
        return result;
    });
    
    // When we get an incoming OAuth http request we complete the oauth
    // handshake, account and token setup before responding.  The
    // results are stored in this map which is then read when the login
    // method is called. Maps state --> return value of `login`
    //
    // XXX we should periodically clear old entries
    oauthAccounts._loginResultForState = {};

  };

  // Handle _oauth paths, gets a bunch of stuff ready for the oauth implementation middleware
  Meteor.accounts.oauth._requestServiceName = function (req) {

    // req.url will be "/_oauth/<service name>?<action>"
    var barePath = req.url.substring(0, req.url.indexOf('?'));
    var splitPath = barePath.split('/');

    // Find service based on url
    var serviceName = splitPath[2];

    // Any non-oauth request will continue down the default middlewares
    // Same goes for service that hasn't been registered
    if (splitPath[1] !== '_oauth') {
      return;
    }

    return serviceName;
  };

  // Make sure we're configured
  Meteor.accounts.oauth._ensureConfigured = function(serviceName) {
    var service = Meteor.accounts[serviceName];

    _.each(Meteor.accounts[serviceName]._requireConfigs, function(key) {
      var configKey = '_' + key;
      if (!service[configKey])
        throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts." + serviceName + ".config first");
    });

    if (!service._secret)
      throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts." + serviceName + ".setSecret first");
  };

  Meteor.accounts.oauth._loadMiddleWare = function(middleware) {
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
  };

})();
