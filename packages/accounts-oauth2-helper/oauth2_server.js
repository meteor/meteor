(function () {
  var connect = __meteor_bootstrap__.require("connect");

  Meteor.accounts.oauth2._services = {};

  Meteor.accounts.oauth._setup({version: 2});

  // connect middleware
  Meteor.accounts.oauth2._handleRequest = function (req, res, next) {

    var serviceName = Meteor.accounts.oauth._requestServiceName(req);
    var service = Meteor.accounts.oauth2._services[serviceName];

    // Skip everything if there's no service set by the oauth middleware
    if (!service) {
      next();
      return;
    }

    // Make sure we're configured
    Meteor.accounts.oauth._ensureConfigured(serviceName);

    if (req.query.error) {
      // The user didn't authorize access
      return null;
    }

    // Make sure we prepare the login results before returning.
    // This way the subsequent call to the `login` method will be
    // immediate.

    try {
      // Get or create user id
      var oauthResult = service && service.handleOauthRequest(req.query);

      // could be null if user declined permissions, or if there was an
      // error of some sort.
      if (oauthResult && req.query.state) {
        var userId = Meteor.accounts.updateOrCreateUser(
          oauthResult.options, oauthResult.extra);

        // Generate and store a login token for reconnect
        // XXX this could go in accounts_server.js instead
        var loginToken = Meteor.accounts._loginTokens.insert({userId: userId});

        // Store results to subsequent call to `login`
        Meteor.accounts.oauth2._loginResultForState[req.query.state] =
          {token: loginToken, id: userId};
      }
    } catch (err) {
      // if we got thrown an error, save it off, it will get passed to
      // the approporiate login call (if any) and reported there.
      //
      // The other option would be to display it in the popup tab that
      // is still open at this point, ignoring the 'close' or 'redirect'
      // we were passed. But then the developer wouldn't be able to
      // style the error or react to it in any way.
      if (req.query.state && err instanceof Error)
        Meteor.accounts.oauth2._loginResultForState[req.query.state] = err;

      // also log to the server console, so the developer sees it.
      Meteor._debug("Exception in oauth2 handler", err);
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
  };

  Meteor.accounts.oauth._loadMiddleWare(Meteor.accounts.oauth2._handleRequest);

})();
