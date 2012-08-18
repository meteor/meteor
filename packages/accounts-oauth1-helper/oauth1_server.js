(function () {
  var connect = __meteor_bootstrap__.require("connect");

  Meteor.accounts.oauth1._services = {};

  Meteor.accounts.oauth._setup({version: 1});

  // connect middleware
  Meteor.accounts.oauth1._handleRequest = function (req, res, next) {

    var serviceName = Meteor.accounts.oauth._requestServiceName(req);
    var service = Meteor.accounts.oauth1._services[serviceName];

    // Skip everything if there's no service set by the oauth middleware
    if (!service) {
      next();
      return;
    }

    // Make sure we're configured
    Meteor.accounts.oauth._ensureConfigured(serviceName);

    // Make sure we prepare the login results before returning.
    // This way the subsequent call to the `login` method will be
    // immediate.

    var config = Meteor.accounts[serviceName];
    var oauth = new OAuth1(config);

    // If we get here with a callback url we need a request token to
    // start the logic process
    if (req.query.callbackUrl) {

      // Get a request token to start auth process
      oauth.getRequestToken(req.query.callbackUrl);

      var redirectUrl = config._urls.authenticate + '?oauth_token=' + oauth.requestToken;
      res.writeHead(302, {'Location': redirectUrl});
      res.end();

    // If we get here without a callback url we've just
    // returned from authentication via the oauth provider
    
    } else {

      // XXX Twitter's docs say to check that oauth_token is the
      // same as the request token received in previous step

      if (!req.query.oauth_token) {
        // The user didn't authorize access
        return null;
      }

      // Get the oauth token for signing requests
      oauth.getAccessToken(req.query);

      // Get or create user id
      var oauthResult = service.handleOauthRequest(oauth);
      
      if (oauthResult) { // could be null if user declined permissions
        var userId = Meteor.accounts.updateOrCreateUser(oauthResult.options, oauthResult.extra);
      
        // Generate and store a login token for reconnect
        // XXX this could go in accounts_server.js instead
        var loginToken = Meteor.accounts._loginTokens.insert({userId: userId});
      
        // Store results to subsequent call to `login`
        Meteor.accounts.oauth1._loginResultForState[req.query.state] =
          {token: loginToken, id: userId};
      }
      
      // We support ?close and ?redirect=URL. Any other query should
      // just serve a blank page
      if ('close' in req.query) { // check with 'in' because we don't set a value
        // Close the popup window
        res.writeHead(200, {'Content-Type': 'text/html'});
        var content =
              '<html><head><script>window.close()</script></head></html>';
        res.end(content, 'utf-8');
      } else if (req.query.redirect) {
        res.writeHead(302, {'Location': req.query.redirect});
        res.end();
      } else {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end('', 'utf-8');
      }
    }
  };

  Meteor.accounts.oauth._loadMiddleWare(Meteor.accounts.oauth1._handleRequest);

})();
