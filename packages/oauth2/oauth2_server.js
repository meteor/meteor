(function () {
  var connect = __meteor_bootstrap__.require("connect");

  Meteor.accounts.oauth2.providers = {};

  Meteor.accounts.registerLoginHandler(function (options) {
    if (!options.oauth)
      return undefined; // don't handle

    var result = Meteor.accounts.oauth2.loginResultForState[options.oauth.state];
    if (result === undefined) // not using `!result` since can be null
      // We weren't notified of the user authorizing the login.
      return null;
    else
      return result;
  });

  // When we get an incoming OAuth http request we complete the
  // facebook handshake, account and token setup before responding.
  // The results are stored in this map which is then read when the
  // login method is called. Maps {oauthState} --> return value of
  // `login`
  Meteor.accounts.oauth2.loginResultForState = {};

  // Listen on /_oauth/*
  __meteor_bootstrap__.app
    .use(connect.query())
    .use(function (req, res, next) {
      Fiber(function() {
        var bareUrl = req.url.substring(0, req.url.indexOf('?'));
        var splitUrl = bareUrl.split('/');

        // Any non-oauth request will continue down the default middlewares
        if (splitUrl[1] !== '_oauth') {
          next();
          return;
        }

        // Make sure we prepare the login results before returning.
        // This way the subsequent call to the `login` method will be
        // immediate.

        var providerName = splitUrl[2];
        var provider = Meteor.accounts.oauth2.providers[providerName];
        // Get or create user id
        var userId = provider.userIdForOauthReq(req);
        // Generate and store a login token for reconnect
        var loginToken = Meteor.accounts._loginTokens.insert({userId: userId});
        // Store results to subsequent call to `login`
        Meteor.accounts.oauth2.loginResultForState[req.query.state] =
          {token: loginToken, id: userId};

        // We support /_oauth?close, /_oauth?redirect=URL. Any other /_oauth request
        // just served a blank page
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
          res.end(content, 'utf-8');
        }
      }).run();
    });

})();