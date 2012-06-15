(function () {

  Meteor.accounts.facebook.setSecret = function (secret) {
    Meteor.accounts.facebook._secret = secret;
  };

  Meteor.accounts.oauth2.registerService('facebook', function(query) {
    if (query.error) {
      // The user didn't authorize access
      // XXX can/should we generalize this into the oauth abstration?
      return null;
    }

    if (!Meteor.accounts.facebook._appId || !Meteor.accounts.facebook._appUrl)
      throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts.facebook.setup first");
    if (!Meteor.accounts.facebook._secret)
      throw new Meteor.accounts.ConfigError("Need to call Meteor.accounts.facebook.setSecret first");

    var accessToken = getAccessToken(query);
    var identity = getIdentity(accessToken);

    return {
      email: identity.email,
      userData: {name: identity.name},
      serviceUserId: identity.id,
      serviceData: {accessToken: accessToken}
    };
  });

  var getAccessToken = function (query) {
    // Request an access token
    var response = Meteor.http.get(
      "https://graph.facebook.com/oauth/access_token", {
        params: {
          client_id: Meteor.accounts.facebook._appId,
          redirect_uri: Meteor.accounts.facebook._appUrl + "/_oauth/facebook?close",
          client_secret: Meteor.accounts.facebook._secret,
          code: query.code
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

  var getIdentity = function (accessToken) {
    var result = Meteor.http.get("https://graph.facebook.com/me", {
      params: {access_token: accessToken}});

    if (result.error)
      throw result.error;
    return result.data;
  };
}) ();