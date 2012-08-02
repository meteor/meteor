(function () {
  var connect = __meteor_bootstrap__.require("connect");

  Meteor.accounts.oauth2._services = {};

  Meteor.accounts.oauth._setup({version: 2});

  // connect middleware
  Meteor.accounts.oauth2._handleRequest = function (req, res, next) {

    var service = Meteor.accounts.oauth2._services[req._serviceName];

    // Skip everything if there's no service set by the oauth middleware
    if (!service) {
      next();
      return;
    }

    if (req.query.error) {
      // The user didn't authorize access
      return null;
    }

    // Make sure we prepare the login results before returning.
    // This way the subsequent call to the `login` method will be
    // immediate.

    // Get or create user id
    var oauthResult = service.handleOauthRequest(req.query);

    if (oauthResult) { // could be null if user declined permissions
      var userId = Meteor.accounts.updateOrCreateUser(oauthResult.options, oauthResult.extra);

      // Generate and store a login token for reconnect
      // XXX this could go in accounts_server.js instead
      var loginToken = Meteor.accounts._loginTokens.insert({userId: userId});

      // Store results to subsequent call to `login`
      Meteor.accounts.oauth2._loginResultForState[req.query.state] =
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
  };

  Meteor.accounts.oauth._loadMiddleWare(Meteor.accounts.oauth2._handleRequest);

})();
