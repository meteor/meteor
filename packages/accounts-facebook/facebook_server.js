var querystring = Npm.require('querystring');

Accounts.addAutopublishFields({
  // publish all fields including access token, which can legitimately
  // be used from the client (if transmitted over ssl or on
  // localhost). https://developers.facebook.com/docs/concepts/login/access-tokens-and-types/,
  // "Sharing of Access Tokens"
  forLoggedInUser: ['services.facebook'],
  forOtherUsers: [
    // https://www.facebook.com/help/167709519956542
    'services.facebook.id', 'services.facebook.username', 'services.facebook.gender'
  ]
});

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

  var response = result.content;

  if (result.error) {
    throw new Error("Failed to complete OAuth handshake with Facebook. " +
                    "HTTP Error " + result.statusCode + ": " + response);
  }

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
    throw new Error("Failed to complete OAuth handshake with Facebook. " + response);
  } else {
    // Success!  Extract the facebook access token and expiration
    // time from the response
    var parsedResponse = querystring.parse(response);
    var fbAccessToken = parsedResponse.access_token;
    var fbExpires = parsedResponse.expires;

    if (!fbAccessToken) {
      throw new Error("Failed to complete OAuth handshake with facebook " +
                      "-- can't find access token in HTTP response. " + response);
    }
    return {
      accessToken: fbAccessToken,
      expiresIn: fbExpires
    };
  }
};

var getIdentity = function (accessToken) {
  var result = Meteor.http.get("https://graph.facebook.com/me", {
    params: {access_token: accessToken}});

  if (result.error) {
    throw new Error("Failed to fetch identity from Facebook. " +
                    "HTTP Error " + result.statusCode + ": " + result.content);
  } else {
    return result.data;
  }
};
