(function () {

  Accounts.oauth.registerService('facebook', 2, function(query) {

    var response = getTokens(query);
    var accessToken = response.accessToken;
    var identity = getIdentity(accessToken);

    var serviceData = {
        id: identity.id,
        accessToken: accessToken,
        email: identity.email,
        expiresAt: (+new Date) + (1000 * response.expiresIn)
      }
      
    if (response.refreshToken) //Not implemented
      serviceData.refreshToken = response.refreshToken;  
      
    return {
      serviceData,
      options: {profile: {name: identity.name}}
    };
  });

  var getTokens = function (query) {
    var config = Accounts.loginServiceConfiguration.findOne({service: 'facebook'});
    if (!config)
      throw new Accounts.ConfigError("Service not configured");

    // Request an access token
    var result = Meteor.http.get(
      "https://graph.facebook.com/oauth/access_token", {
        params: {
          client_id: config.appId,
          redirect_uri: Meteor.absoluteUrl("_oauth/facebook?close"),
          client_secret: config.secret,
          code: query.code
        }
      });

    if (result.error)
      throw result.error;
    var response = result.content;

    // Errors come back as JSON but success looks like a query encoded
    // in a url
    var error_response;
    try {
      // Just try to parse so that we know if we failed or not,
      // while storing the parsed results
      error_response = JSON.parse(response);
    } catch (e) {
      error_response = null;
    }

    if (error_response) {
      throw new Meteor.Error(500, "Error trying to get access token from Facebook", error_response);
    } else {
      // Success!  Extract the facebook access token from the
      // response
      var fbAccessToken;
      var fbExpires;
      //response expected format: access_token=USER_ACCESS_TOKEN&expires=NUMBER_OF_SECONDS_UNTIL_TOKEN_EXPIRES
      _.each(response.split('&'), function(kvString) {
        var kvArray = kvString.split('=');
        if (kvArray[0] === 'access_token')
          fbAccessToken = kvArray[1];
        if (kvArray[0] === 'expires')
          fbExpires = kvArray[1];
      });

      if (!fbAccessToken)
        throw new Meteor.Error(500, "Couldn't find access token in HTTP response.");
      return {
        accessToken: fbAccessToken,
        //refreshToken: fbRefreshToken, //Not implemented
        expiresIn: fbExpires
      }
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
