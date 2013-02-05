(function () {

  var querystring = __meteor_bootstrap__.require('querystring');

  Accounts.oauth.registerService('facebook', 2, function(query) {

    var response = getTokenResponse(query);
    var accessToken = response.accessToken;
    var identity = getIdentity(accessToken);

    var serviceData = {
      accessToken: accessToken,
      expiresAt: (+new Date) + (1000 * response.expiresIn)
    };

    // include all fields from facebook
    // http://developers.facebook.com/docs/reference/login/public-profile-and-friend-list/
    var whitelisted = ['id', 'email', 'name', 'first_name',
        'last_name', 'link', 'username', 'gender', 'locale', 'age_range'];

    var fields = _.pick(identity, whitelisted);
    _.extend(serviceData, fields);

    return {
      serviceData: serviceData,
      options: {profile: {name: identity.name}}
    };
  });

  // returns an object containing:
  // - accessToken
  // - expiresIn: lifetime of token in seconds
  var getTokenResponse = function (query) {
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
      // Success!  Extract the facebook access token and expiration
      // time from the response
      var parsedResponse = querystring.parse(response);
      var fbAccessToken = parsedResponse.access_token;
      var fbExpires = parsedResponse.expires;

      if (!fbAccessToken)
        throw new Meteor.Error(500, "Couldn't find access token in HTTP response.");
      return {
        accessToken: fbAccessToken,
        expiresIn: fbExpires
      };
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
