(function() {

  var connect = __meteor_bootstrap__.require("connect");

  // Incoming OAuth http requests are recorded here when the OAuth
  // process is completed inside a popup window. Afterwards, these are
  // read by the OAuth login method to complete the process.
  //
  // @type {Object} maps from Oauth "state" to request
  Meteor.accounts._unmatchedOauthRequests = {};

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

        Meteor.accounts._unmatchedOauthRequests[req.query.state] = req;

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

  Meteor.methods({
    // @returns {Object|null}
    //   If successful, returns {token: reconnectToken, id: userId}
    //   If unsuccessful (for example, if the user closed the oauth login popup),
    //   returns null
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
        var unmatchedRequest = Meteor.accounts._unmatchedOauthRequests[options.oauth.state];
        if (unmatchedRequest) {
          // We had previously received the HTTP request with the OAuth code
          fbAccessToken = handleOauthRequest(unmatchedRequest);
          delete Meteor.accounts._unmatchedOauthRequests[options.oauth.state];

          // If the user didn't authorize the login, either explicitly
          // or by closing the popup window, return null
          if (!fbAccessToken)
            return null;
        } else {
          return null;
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
          "&redirect_uri=" + Meteor.accounts.facebook._appUrl + "/_oauth/facebook?close" +
          "&client_secret=" + Meteor.accounts.facebook._secret +
          "&code=" + req.query.code).content;

      // Errors come back as JSON but success looks like a query encoded in a url
      var error_response = null;
      try {
        // Just try to parse so that we know if we failed or not,
        // while storing the parsed results
        var error_response = JSON.parse(response);
      } catch (e) {
      }

      if (error_response) {
        if (error_response.error) {
          throw new Meteor.Error("Error trying to get access token from Facebook", error_response);
        } else {
          throw new Meteor.Error("Unexpected response when trying to get access token from Facebook", error_response);
        }
      } else {
        // Success!  Extract the facebook access token from the
        // response
        var fbAccessToken;
        _.each(response.split('&'), function(kvString) {
          var kvArray = kvString.split('=');
          if (kvArray[0] === 'access_token')
            fbAccessToken = kvArray[1];
          // XXX also parse the "expires" argument?
        });

        return fbAccessToken;
      }
    } else {
      throw new Meteor.Error("Unknown OAuth provider: " + provider);
    }
  };
})();

