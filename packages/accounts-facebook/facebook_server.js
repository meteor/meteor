(function () {

  Meteor.accounts.facebook.setSecret = function (secret) {
    Meteor.accounts.facebook._secret = secret;
  };

  // register the facebook identity provider
  Meteor.accounts.oauth2.providers.facebook = {
    userIdForOauthReq: function(req) {
      if (!Meteor.accounts.facebook._appId || !Meteor.accounts.facebook._appUrl)
        throw new Meteor.accounts.facebook.SetupError("Need to call Meteor.accounts.facebook.setup first");
      if (!Meteor.accounts.facebook._secret)
        throw new Meteor.accounts.facebook.SetupError("Need to call Meteor.accounts.facebook.setSecret first");

      var accessToken = getAccessToken(req);
      // If the user didn't authorize the login, either explicitly
      // or by closing the popup window, return null
      if (!accessToken)
        return null;

      // Fetch user's facebook identity
      var identity = Meteor.http.get("https://graph.facebook.com/me", {
          params: {access_token: accessToken}}).data;

      return Meteor.accounts.updateOrCreateUser(
        identity.email, {name: identity.name},
        'facebook', identity.id, {accessToken: accessToken});
    }
  };

  // @returns {String} Facebook access token
  var getAccessToken = function (req) {
    if (req.query.error) {
      // The user didn't authorize access
      return null;
    }

    // Request an access token
    var response = Meteor.http.get(
      "https://graph.facebook.com/oauth/access_token", {
        params: {
          client_id: Meteor.accounts.facebook._appId,
          redirect_uri: Meteor.accounts.facebook._appUrl + "/_oauth/facebook?close",
          client_secret: Meteor.accounts.facebook._secret,
          code: req.query.code
        }
      }).content;

    // Errors come back as JSON but success looks like a query encoded in a url
    var error_response;
    try {
      // Just try to parse so that we know if we failed or not,
      // while storing the parsed results
      error_response = JSON.parse(response);
    } catch (e) {
      error_response = null;
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
  };
}) ();