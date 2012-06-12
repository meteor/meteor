(function() {

  var connect = __meteor_bootstrap__.require("connect");

  // A map from oauth "state"s to `Future`s on which calling `return`
  // will unblock the corresponding outstanding call to `login`
  var oauthFutures = {};

  // A map from oauth "state"s to incoming requests that, when processed,
  // had no matching future (presumably because the login popup window
  // finished its work before the server executed the call to `login`)
  var unmatchedOauthRequests = {};

  // XXX add test for supporting both: first receiving the oauth request
  // and then executing call to `login`; and vice versa

  Meteor.accounts.facebook.setSecret = function(secret) {
    Meteor.accounts.facebook._secret = secret;
  };

  // Listen on /_oauth/*
  __meteor_bootstrap__.app
    .use(connect.query())
    .use(function (req, res, next) {
      Fiber(function() {
        // Any non-oauth request will continue down the default middlewares
        if (req.url.split('/')[1] !== '_oauth') {
          next();
          return;
        }

        if (!Meteor.accounts.facebook._appId || !Meteor.accounts.facebook._appUrl)
          throw new Meteor.accounts.facebook.SetupError("Need to call Meteor.accounts.facebook.setup first");
        if (!Meteor.accounts.facebook._secret)
          throw new Meteor.accounts.facebook.SetupError("Need to call Meteor.accounts.facebook.setSecret first");

        // Close the popup window
        res.writeHead(200, { 'Content-Type': 'text/html' });
        var content =
              '<html><head><script>window.close()</script></head></html>';
        res.end(content, 'utf-8');

        // Try to unblock the appropriate call to `login`
        var future = oauthFutures[req.query.state];
        if (future) {
          // Unblock the `login` call
          future.return(handleOauthRequest(req));
        } else {
          // Store this request. We expect to soon get a call to `login`
          unmatchedOauthRequests[req.query.state] = req;
        }
      }).run();
    });

  Meteor.methods({
    login: function(options) {
      // XXX write test for updateOrCreateUser
      var updateOrCreateUser = function(email, fbId, fbAccessToken) {
        var userByEmail = Meteor.users.findOne({emails: email});
        if (userByEmail) {
          var user = userByEmail;
          if (!user.services || !user.services.facebook)
            Meteor.users.update(user, {$set: {"services.facebook": {
              id: fbId,
              accessToken: fbAccessToken
            }}});
          return user._id;
        } else {
          var userByFacebookId = Meteor.users.findOne({"services.facebook.id": fbId});
          if (userByFacebookId) {
            var user = userByFacebookId;
            if (user.emails.indexOf(email) === -1) {
              // The user may have changed the email address associated with
              // their facebook account.
              Meteor.users.update(user, {$push: {emails: email}});
            }
            return user._id;
          } else {
            return Meteor.users.insert({
              emails: [email],
              services: {
                facebook: {id: fbId, accessToken: fbAccessToken}
              }
            });
          }
        }
      };

      if (options.oauth) {
        if (options.oauth.version !== 2 || options.oauth.provider !== 'facebook')
          throw new Meteor.Error("We only support facebook login for now. More soon!");

        var fbAccessToken;
        if (unmatchedOauthRequests[options.oauth.state]) {
          // We had previously received the HTTP request with the OAuth code
          fbAccessToken = handleOauthRequest(
            unmatchedOauthRequests[options.oauth.state]);
          delete unmatchedOauthRequests[options.oauth.state];
        } else {
          if (oauthFutures[options.oauth.state])
            throw new Error("STRANGE! We are trying to set up a future for this OAuth state twice " +
                            "(this could happen if one calls login twice without waiting). " +
                            options.oauth.state);

          // Prepare Future that will be `return`ed when we get an incoming
          // HTTP request with the OAuth code
          oauthFutures[options.oauth.state] = new Future;
          fbAccessToken = oauthFutures[options.oauth.state].wait();
          delete oauthFutures[options.oauth.state];
        }

        if (!fbAccessToken) {
          // if cancelled or not authorized
          throw new Meteor.Error("Login cancelled or not authorized by user");
        }

        // Fetch user's facebook identity
        var identity = Meteor.http.get(
          "https://graph.facebook.com/me?access_token=" + fbAccessToken).data;
        this.setUserId(updateOrCreateUser(identity.email, identity.id, fbAccessToken));

        // Generate and store a login token for reconnect
        var loginToken = Meteor.accounts._loginTokens.insert({
          userId: this.userId()
        });

        return {
          token: loginToken,
          id: this.userId()
        };
      } else if (options.resume) {
        var loginToken = Meteor.accounts._loginTokens.findOne({_id: options.resume});
        if (!loginToken)
          throw new Meteor.Error("Couldn't find login token");
        this.setUserId(loginToken.userId);

        return {
          token: loginToken,
          id: this.userId()
        };
      } else {
        throw new Meteor.Error("Unrecognized options for login request");
      }
  },

  logout: function() {
    this.setUserId(null);
    }
  });

  // @returns {String} Facebook access token
  var handleOauthRequest = function(req) {
    var bareUrl = req.url.substring(0, req.url.indexOf('?'));
    var provider = bareUrl.split('/')[2];
    if (provider === 'facebook') {
      if (req.query.error) {
        // Either the user didn't authorize access or we cancelled
        // this outstanding login request (such as when the user
        // closes the login popup window)
        return null;
      }

      // Request an access token
      var response = Meteor.http.get(
        "https://graph.facebook.com/oauth/access_token?" +
          "client_id=" + Meteor.accounts.facebook._appId +
          // XXX what does this redirect_uri even mean?
          "&redirect_uri=" + Meteor.accounts.facebook._appUrl + "/_oauth/facebook" +
          "&client_secret=" + Meteor.accounts.facebook._secret +
          "&code=" + req.query.code).content;

      // Extract the facebook access token from the response
      var fbAccessToken;
      _.each(response.split('&'), function(kvString) {
        var kvArray = kvString.split('=');
        if (kvArray[0] === 'access_token')
          fbAccessToken = kvArray[1];
        // XXX also parse the "expires" argument?
      });

      return fbAccessToken;
    } else {
      throw new Meteor.Error("Unknown OAuth provider: " + provider);
    }
  };
})();

