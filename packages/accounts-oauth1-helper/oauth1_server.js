(function () {
  var connect = __meteor_bootstrap__.require("connect");

  // XXX probably need to catch exceptions here as we do in oauth2_server.js
  // or put that in oauth_server.js instead

  // A place to cache request tokens pending verification
  Meteor.accounts.oauth1._requestTokens = {};

  // connect middleware
  Meteor.accounts.oauth1._handleRequest = function (service, query, res) {

    // Make sure we prepare the login results before returning.
    // This way the subsequent call to the `login` method will be
    // immediate.

    var config = Meteor.accounts[service.serviceName];
    var oauth = new OAuth1(config);

    // If we get here with a callback url we need a request token to
    // start the logic process
    if (query.callbackUrl) {

      // Get a request token to start auth process
      oauth.getRequestToken(query.callbackUrl);

      // Keep track of request token so we can verify it on the next step
      Meteor.accounts.oauth1._requestTokens[query.state] = oauth.requestToken;

      var redirectUrl = config._urls.authenticate + '?oauth_token=' + oauth.requestToken;
      res.writeHead(302, {'Location': redirectUrl});
      res.end();

    // If we get here without a callback url we've just
    // returned from authentication via the oauth provider

    } else {

      // Get the user's request token so we can verify it and clear it
      var requestToken = Meteor.accounts.oauth1._requestTokens[query.state];
      delete Meteor.accounts.oauth1._requestTokens[query.state];

      // Verify user authorized access and the oauth_token matches 
      // the requestToken from previous step
      if (query.oauth_token && query.oauth_token === requestToken) {

        // Get the access token for signing requests
        oauth.getAccessToken(query);

        // Get or create user id
        var oauthResult = service.handleOauthRequest(oauth);
        var userId = Meteor.accounts.updateOrCreateUser(oauthResult.options, oauthResult.extra);

        // Generate and store a login token for reconnect
        // XXX this could go in accounts_server.js instead
        var loginToken = Meteor.accounts._loginTokens.insert({userId: userId});

        // Store results to subsequent call to `login`
        Meteor.accounts.oauth._loginResultForState[query.state] =
          {token: loginToken, id: userId};
      }
    }

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
