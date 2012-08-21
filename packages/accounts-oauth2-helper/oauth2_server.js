(function () {
  var connect = __meteor_bootstrap__.require("connect");

  // connect middleware
  Meteor.accounts.oauth2._handleRequest = function (service, query, res) {
    if (query.error) {
      // The user didn't authorize access
      return;
    }

    // Make sure we prepare the login results before returning.
    // This way the subsequent call to the `login` method will be
    // immediate.

    // Get or create user id
    var oauthResult = service.handleOauthRequest(query);

    var userId = Meteor.accounts.updateOrCreateUser(
      oauthResult.options, oauthResult.extra);

    // Generate and store a login token for reconnect
    // XXX this could go in accounts_server.js instead
    var loginToken = Meteor.accounts._loginTokens.insert({userId: userId});

    // Store results to subsequent call to `login`
    Meteor.accounts.oauth._loginResultForState[query.state] =
      {token: loginToken, id: userId};

    // XXX push down to oauth_server.js?

    // We support ?close and ?redirect=URL. Any other query should
    // just serve a blank page
    if ('close' in query) { // check with 'in' because we don't set a value
      // Close the popup window
      res.writeHead(200, {'Content-Type': 'text/html'});
      var content =
            '<html><head><script>window.close()</script></head></html>';
      res.end(content, 'utf-8');
    } else if (query.redirect) {
      res.writeHead(302, {'Location': query.redirect});
      res.end();
    } else {
      res.writeHead(200, {'Content-Type': 'text/html'});
      res.end('', 'utf-8');
    }
  };

})();
